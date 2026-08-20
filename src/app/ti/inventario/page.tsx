import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { shortDate, custodyFolio } from "@/lib/utils/format";
import {
  DEVICE_CATEGORIES,
  deviceCategory,
  fieldFromRow,
  type CustomField,
  type CustomFieldValues,
  EMPTY_CREDENTIALS,
} from "@/lib/domain/inventory";
import { CUSTODY_STATUSES, defaultTemplate, type CustodyStatus } from "@/lib/domain/custody";
import Badge from "@/components/ui/Badge";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import DeviceCredentials from "@/components/inventory/DeviceCredentials";
import ExtraFields from "@/components/inventory/ExtraFields";
import ManageTicketModal from "@/components/tickets/ManageTicketModal";
import NewDevice from "@/components/inventory/NewDevice";
import { assignDevice, editDevice, deleteDevice } from "./actions";
import { createCustodyLetterForDevice } from "../responsivas/actions";
import { jsonbObject } from "@/lib/utils/jsonb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario" };

const ESTADOS = ["activo", "en_reparacion", "almacen", "baja"];
const ETIQUETA_ESTADO: Record<string, string> = {
  activo: "Activo",
  en_reparacion: "En reparación",
  almacen: "Almacén",
  baja: "Baja",
};

// A representative type per category, for its tab glyph.
const TIPO_REP: Record<string, string> = {
  computo: "laptop",
  celular: "celular",
  linea: "linea",
  software: "software",
};

// Days within which a warranty counts as expiring soon (a subtle highlight in
// the table).
const DIAS_GARANTIA = 90;

type CustodyRow = {
  id: string;
  equipo_id: string | null;
  plantilla: string;
  num: number;
  estado: string;
  archivo_url: string | null;
};

export default async function Inventario({
  searchParams,
}: {
  searchParams: Promise<{
    cat?: string;
    q?: string;
    estado?: string;
    asignacion?: string;
    resguardo?: string;
  }>;
}) {
  const { cat: catParam, q = "", estado = "", asignacion = "", resguardo } = await searchParams;
  const cat = deviceCategory(catParam);
  const c = cat.campos;

  const sb = await getSupabase();
  const titulo = (
    <div>
      <h1 className="pagina-titulo">Inventario</h1>
      <p className="pagina-desc">Cómputo, celulares, tablets, líneas telefónicas y software</p>
    </div>
  );
  const responsivasLink = (
    <Link href="/ti/responsivas" className="boton secundario">
      Responsivas
    </Link>
  );
  if (!sb) {
    return (
      <>
        <div className="pagina-head">
          {titulo}
          {responsivasLink}
        </div>
        <NoConnection />
      </>
    );
  }

  const [equiposQ, empleadosQ, respQ, camposQ] = await Promise.all([
    sb
      .from("equipos")
      .select(
        "id, categoria, nombre, tipo, marca, modelo, num_serie, telefono, asignado_a, asignado_email, ubicacion, estado, fecha_compra, garantia_hasta, notas, accesos, extras, created_at",
      )
      .order("created_at", { ascending: false }),
    sb.from("empleados").select("nombre, correo").eq("estado", "activo").order("nombre"),
    sb
      .from("responsivas")
      .select("id, equipo_id, plantilla, num, estado, archivo_url")
      .order("created_at", { ascending: false }),
    sb.from("campos_inventario").select("*").eq("activo", true).order("orden"),
  ]);
  const todos = equiposQ.data ?? [];
  const empleados = empleadosQ.data ?? [];
  const responsivas = (respQ.data ?? []) as CustodyRow[];

  // Custom-field definitions grouped by category (for create and edit).
  const camposPorCategoria = {} as Record<string, CustomField[]>;
  for (const cat of DEVICE_CATEGORIES) camposPorCategoria[cat.value] = [];
  for (const fila of camposQ.data ?? []) {
    const def = fieldFromRow(fila);
    (camposPorCategoria[def.categoria] ??= []).push(def);
  }
  const camposCat = camposPorCategoria[cat.value] ?? [];

  // Most recent custody letter per device (the list already arrives newest first).
  const respPorEquipo = new Map<string, CustodyRow>();
  for (const r of responsivas) {
    if (r.equipo_id && !respPorEquipo.has(r.equipo_id)) respPorEquipo.set(r.equipo_id, r);
  }
  const respAviso = resguardo ? responsivas.find((r) => r.id === resguardo) : undefined;

  // The current category's list; the summary is computed over it (stable, before
  // any search).
  const listaCat = todos.filter((e) => (e.categoria ?? "computo") === cat.value);
  const resumen = {
    total: listaCat.length,
    activos: listaCat.filter((e) => e.estado === "activo").length,
    reparacion: listaCat.filter((e) => e.estado === "en_reparacion").length,
    libres: listaCat.filter((e) => !e.asignado_email && e.estado !== "baja").length,
    respPendientes: listaCat.filter((e) => e.asignado_email && !respPorEquipo.has(e.id)).length,
  };

  // Filters (server-side, through URL params), applied over the category list.
  const text = q.trim().toLowerCase();
  let lista = listaCat;
  if (estado) lista = lista.filter((e) => e.estado === estado);
  if (asignacion === "libres") lista = lista.filter((e) => !e.asignado_email);
  if (asignacion === "asignados") lista = lista.filter((e) => e.asignado_email);
  if (text) {
    lista = lista.filter((e) =>
      [e.nombre, e.marca, e.modelo, e.num_serie, e.telefono, e.asignado_a, e.asignado_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text),
    );
  }
  const hayFiltro = Boolean(text || estado || asignacion);
  const hoy = new Date().toISOString().slice(0, 10);
  const limiteGarantia = new Date(Date.now() + DIAS_GARANTIA * 86400000).toISOString().slice(0, 10);

  const selectorEmpleado = (nombre: string, defaultValue?: string) => (
    <select name={nombre} defaultValue={defaultValue ?? ""}>
      <option value="">— Libre / sin asignar —</option>
      {empleados.map((p) => (
        <option key={p.correo} value={p.correo}>
          {p.nombre}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="pagina-head">
        {titulo}
        <div className="pagina-head-acciones">
          <NewDevice
            empleados={empleados}
            categoriaInicial={cat.value}
            camposPorCategoria={camposPorCategoria}
          />
          <Link href="/ti/inventario/configuracion" className="boton secundario">
            Configurar campos
          </Link>
          {responsivasLink}
        </div>
      </div>

      {respAviso && (
        <div className="banner-exito" style={{ marginBottom: 20 }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div>
            <strong>
              Responsiva generada ·{" "}
              {custodyFolio(defaultTemplate(respAviso.plantilla).prefijoFolio, respAviso.num)}
            </strong>
            Quedó como borrador.{" "}
            <Link href={`/ti/responsivas/${respAviso.id}`} style={{ textDecoration: "underline" }}>
              Abrir y completar
            </Link>
            {" · "}
            <Link
              href={`/ti/responsivas/${respAviso.id}/imprimir`}
              style={{ textDecoration: "underline" }}
            >
              Imprimir
            </Link>
          </div>
        </div>
      )}

      <nav className="tabs" aria-label="Categorías del inventario">
        {DEVICE_CATEGORIES.map((t) => {
          const n = todos.filter((e) => (e.categoria ?? "computo") === t.value).length;
          return (
            <Link
              key={t.value}
              href={`/ti/inventario?cat=${t.value}`}
              className={`tab ${t.value === cat.value ? "activo" : ""}`}
            >
              <IconoTipo tipo={TIPO_REP[t.value]} className="tab-glifo" size={16} />
              {t.label} <span className="tab-num">{n}</span>
            </Link>
          );
        })}
      </nav>

      {/* Resumen de la categoría: panorama de un vistazo. */}
      <div className="metricas compacta inv-resumen">
        <div className="metrica">
          <div className="metrica-valor">{resumen.total}</div>
          <div className="metrica-label">Total</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.activos}</div>
          <div className="metrica-label">Activos</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${resumen.reparacion ? "alerta" : ""}`}>
            {resumen.reparacion}
          </div>
          <div className="metrica-label">En reparación</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.libres}</div>
          <div className="metrica-label">
            {cat.value === "celular" || cat.value === "linea" ? "Libres" : "Sin asignar"}
          </div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${resumen.respPendientes ? "alerta" : ""}`}>
            {resumen.respPendientes}
          </div>
          <div className="metrica-label">Resguardos pendientes</div>
        </div>
      </div>

      {/* Búsqueda y filtros (server, por URL). */}
      <div className="toolbar">
        <form className="filtros" method="get">
          <input type="hidden" name="cat" value={cat.value} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, serie, número o empleado…"
            aria-label="Buscar en el inventario"
          />
          <select name="estado" defaultValue={estado} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
          <select name="asignacion" defaultValue={asignacion} aria-label="Filtrar por asignación">
            <option value="">Asignados y libres</option>
            <option value="libres">Solo libres</option>
            <option value="asignados">Solo asignados</option>
          </select>
          <button className="boton secundario" type="submit">
            Filtrar
          </button>
          {hayFiltro && (
            <Link href={`/ti/inventario?cat=${cat.value}`} className="boton-texto">
              Limpiar
            </Link>
          )}
        </form>
      </div>

      {lista.length === 0 ? (
        <div className="vacio">
          <strong>
            {hayFiltro ? "Sin coincidencias" : `Sin registros en ${cat.label.toLowerCase()}`}
          </strong>
          {hayFiltro
            ? "Ajusta la búsqueda o limpia los filtros."
            : "Registra el primero con el botón de arriba."}
        </div>
      ) : (
        <table className="tabla inv-tabla">
          <thead>
            <tr>
              <th>{cat.value === "software" ? "Licencia" : "Equipo"}</th>
              {c.num_serie && <th>{c.num_serie.label}</th>}
              {c.telefono && <th>{c.telefono.label}</th>}
              <th>Asignado a</th>
              <th>Resguardo</th>
              {c.ubicacion && <th>Ubicación</th>}
              {c.fechas && <th>{c.garantiaLabel}</th>}
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => {
              const r = respPorEquipo.get(e.id);
              const ins = r
                ? (CUSTODY_STATUSES[r.estado as CustodyStatus] ?? CUSTODY_STATUSES.borrador)
                : null;
              const porVencer =
                c.fechas &&
                e.garantia_hasta &&
                e.garantia_hasta >= hoy &&
                e.garantia_hasta <= limiteGarantia;
              return (
                <tr key={e.id}>
                  <td data-label={cat.value === "software" ? "Licencia" : "Equipo"}>
                    <div className="inv-celda-equipo">
                      <IconoTipo tipo={e.tipo} />
                      <div>
                        <div className="celda-principal">{e.nombre}</div>
                        <div className="suave" style={{ fontSize: 12.5 }}>
                          {[e.marca, e.modelo].filter(Boolean).join(" ") || e.tipo}
                        </div>
                      </div>
                    </div>
                  </td>
                  {c.num_serie && (
                    <td data-label={c.num_serie.label} className="mono">
                      {e.num_serie ?? "—"}
                    </td>
                  )}
                  {c.telefono && (
                    <td data-label={c.telefono.label} className="mono">
                      {e.telefono ?? "—"}
                    </td>
                  )}
                  <td data-label="Asignado a">
                    {e.asignado_email ? (
                      <span className="inv-asignado">
                        <span className="inv-avatar" aria-hidden>
                          {initials(e.asignado_a ?? e.asignado_email)}
                        </span>
                        <span>
                          <span className="inv-asignado-nombre">{e.asignado_a}</span>
                          <span className="suave" style={{ fontSize: 12, display: "block" }}>
                            {e.asignado_email}
                          </span>
                        </span>
                      </span>
                    ) : e.asignado_a ? (
                      <span className="suave">{e.asignado_a}</span>
                    ) : cat.value === "celular" || cat.value === "linea" ? (
                      <span className="insignia ok">libre</span>
                    ) : (
                      <span className="suave">—</span>
                    )}
                  </td>
                  <td data-label="Resguardo">
                    {r && ins ? (
                      <Link
                        href={`/ti/responsivas/${r.id}`}
                        className={`resguardo-chip ${ins.tone}`}
                        title="Abrir responsiva"
                      >
                        <span className="punto" />
                        {ins.text}
                      </Link>
                    ) : e.asignado_email ? (
                      <form action={createCustodyLetterForDevice}>
                        <input type="hidden" name="equipo_id" value={e.id} />
                        <SubmitButton className="boton secundario mini" ocupado="…">
                          Generar
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="suave">—</span>
                    )}
                  </td>
                  {c.ubicacion && (
                    <td data-label="Ubicación" className="suave">
                      {e.ubicacion ?? "—"}
                    </td>
                  )}
                  {c.fechas && (
                    <td
                      data-label={c.garantiaLabel}
                      className={`mono inv-garantia ${porVencer ? "por-vencer" : ""}`}
                    >
                      {shortDate(e.garantia_hasta)}
                    </td>
                  )}
                  <td data-label="Estado">
                    <Badge value={e.estado} />
                  </td>
                  <td data-label="" className="inv-acciones-celda">
                    <ManageTicketModal
                      titulo={e.nombre}
                      subtitulo={[e.marca, e.modelo].filter(Boolean).join(" ") || e.tipo}
                      resumen={
                        <>
                          <dl className="modal-datos">
                            {c.num_serie && (
                              <div>
                                <dt>{c.num_serie.label}</dt>
                                <dd className="mono">{e.num_serie ?? "—"}</dd>
                              </div>
                            )}
                            {c.telefono && (
                              <div>
                                <dt>{c.telefono.label}</dt>
                                <dd className="mono">{e.telefono ?? "—"}</dd>
                              </div>
                            )}
                            {c.ubicacion && (
                              <div>
                                <dt>Ubicación</dt>
                                <dd>{e.ubicacion ?? "—"}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Asignado a</dt>
                              <dd>{e.asignado_a ?? "Libre"}</dd>
                            </div>
                            <div>
                              <dt>Estado</dt>
                              <dd>
                                <Badge value={e.estado} />
                              </dd>
                            </div>
                            {c.fechas && (
                              <div>
                                <dt>{c.garantiaLabel}</dt>
                                <dd className="mono">{shortDate(e.garantia_hasta)}</dd>
                              </div>
                            )}
                            {camposCat.map((def) => {
                              const val = (e.extras as CustomFieldValues | null)?.[def.clave];
                              if (!val) return null;
                              const text =
                                def.tipo === "booleano"
                                  ? "Sí"
                                  : def.tipo === "fecha"
                                    ? shortDate(val)
                                    : val;
                              return (
                                <div key={def.clave}>
                                  <dt>{def.label}</dt>
                                  <dd className="mono">{text}</dd>
                                </div>
                              );
                            })}
                          </dl>
                          <form action={assignDevice} className="inv-gestionar-asignar">
                            <input type="hidden" name="id" value={e.id} />
                            <input type="hidden" name="categoria" value={cat.value} />
                            <label className="mini-label">Asignar / liberar</label>
                            {selectorEmpleado("empleado", e.asignado_email ?? "")}
                            <SubmitButton className="boton secundario mini" ocupado="…">
                              Aplicar
                            </SubmitButton>
                          </form>
                        </>
                      }
                    >
                      {/* Editar: todos los campos. El hidden conserva la asignación actual
                            (editDevice desasigna si no recibe `empleado`). */}
                      <form action={editDevice} className="bloque-form">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="categoria" value={cat.value} />
                        <input type="hidden" name="empleado" value={e.asignado_email ?? ""} />
                        <label className="mini-label">{c.nombre.label}</label>
                        <input
                          name="nombre"
                          defaultValue={e.nombre ?? ""}
                          required={cat.value !== "linea"}
                        />
                        {cat.tipos.length > 1 && (
                          <>
                            <label className="mini-label">Tipo</label>
                            <select name="tipo" defaultValue={e.tipo}>
                              {cat.tipos.map((t) => (
                                <option key={t} value={t}>
                                  {t.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {c.marca && (
                          <>
                            <label className="mini-label">{c.marca.label}</label>
                            <input name="marca" defaultValue={e.marca ?? ""} />
                          </>
                        )}
                        {c.modelo && (
                          <>
                            <label className="mini-label">{c.modelo.label}</label>
                            <input name="modelo" defaultValue={e.modelo ?? ""} />
                          </>
                        )}
                        {c.num_serie && (
                          <>
                            <label className="mini-label">{c.num_serie.label}</label>
                            <input name="num_serie" defaultValue={e.num_serie ?? ""} />
                          </>
                        )}
                        {c.telefono && (
                          <>
                            <label className="mini-label">{c.telefono.label}</label>
                            <input
                              name="telefono"
                              defaultValue={e.telefono ?? ""}
                              required={cat.value === "linea"}
                            />
                          </>
                        )}
                        {c.ubicacion && (
                          <>
                            <label className="mini-label">Ubicación</label>
                            <input name="ubicacion" defaultValue={e.ubicacion ?? ""} />
                          </>
                        )}
                        <label className="mini-label">Estado</label>
                        <select name="estado" defaultValue={e.estado}>
                          {ESTADOS.map((s) => (
                            <option key={s} value={s}>
                              {ETIQUETA_ESTADO[s]}
                            </option>
                          ))}
                        </select>
                        {c.fechas && (
                          <div className="dos-col">
                            <div>
                              <label className="mini-label">Compra</label>
                              <input
                                name="fecha_compra"
                                type="date"
                                defaultValue={e.fecha_compra ?? ""}
                              />
                            </div>
                            <div>
                              <label className="mini-label">{c.garantiaLabel}</label>
                              <input
                                name="garantia_hasta"
                                type="date"
                                defaultValue={e.garantia_hasta ?? ""}
                              />
                            </div>
                          </div>
                        )}
                        <label className="mini-label">Notas</label>
                        <textarea name="notas" defaultValue={e.notas ?? ""} rows={2} />
                        <DeviceCredentials value={jsonbObject(e.accesos, EMPTY_CREDENTIALS)} />
                        <ExtraFields
                          definiciones={camposCat}
                          value={(e.extras ?? {}) as CustomFieldValues}
                        />
                        <SubmitButton className="boton mini" ocupado="Guardando…">
                          Guardar cambios
                        </SubmitButton>
                      </form>

                      <form action={deleteDevice} className="inv-gestionar-eliminar">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="categoria" value={cat.value} />
                        <SubmitButton
                          className="boton-texto"
                          style={{ color: "var(--critico)" }}
                          ocupado="Eliminando…"
                        >
                          Eliminar {cat.singular}
                        </SubmitButton>
                      </form>
                    </ManageTicketModal>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// Initials for the assignee avatar: "Luis Hernández" -> "LH".
function initials(s: string): string {
  return (
    s
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

// Line icon per device type (static, hoisted out of the per-row render).
// Reused in the table (default className) and in the tabs (className
// "tab-glifo", which inherits the tab colour), varying only in size.
function IconoTipo({
  tipo,
  className = "inv-tipo-icono",
  size = 20,
}: {
  tipo: string | null;
  className?: string;
  size?: number;
}) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const path = (() => {
    switch (tipo) {
      case "laptop":
        return (
          <>
            <rect x="3" y="5" width="18" height="12" rx="2" />
            <path d="M2 20h20" />
          </>
        );
      case "desktop":
        return (
          <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </>
        );
      case "monitor":
        return (
          <>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M9 21h6M12 17v4" />
          </>
        );
      case "impresora":
        return (
          <>
            <path d="M6 9V3h12v6" />
            <rect x="4" y="9" width="16" height="8" rx="2" />
            <path d="M8 17h8v4H8z" />
          </>
        );
      case "red":
        return (
          <>
            <rect x="9" y="3" width="6" height="6" rx="1" />
            <rect x="3" y="15" width="6" height="6" rx="1" />
            <rect x="15" y="15" width="6" height="6" rx="1" />
            <path d="M12 9v3M6 15v-3h12v3" />
          </>
        );
      case "servidor":
        return (
          <>
            <rect x="3" y="4" width="18" height="7" rx="2" />
            <rect x="3" y="13" width="18" height="7" rx="2" />
            <path d="M7 7.5h.01M7 16.5h.01" />
          </>
        );
      case "celular":
        return (
          <>
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <path d="M11 18h2" />
          </>
        );
      case "tablet":
        return (
          <>
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M11 18h2" />
          </>
        );
      case "linea":
        return (
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        );
      case "software":
        return (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 10l-2 2 2 2M16 10l2 2-2 2M13 8l-2 8" />
          </>
        );
      case "perifericos":
        return (
          <>
            <rect x="8" y="3" width="8" height="18" rx="4" />
            <path d="M12 3v6" />
          </>
        );
      default:
        return (
          <>
            <path d="m21 8-9-5-9 5 9 5 9-5z" />
            <path d="M3 8v8l9 5 9-5V8" />
          </>
        );
    }
  })();
  return (
    <svg className={className} width={size} height={size} {...props}>
      {path}
    </svg>
  );
}
