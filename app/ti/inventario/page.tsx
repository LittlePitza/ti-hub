import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folioResponsiva } from "@/lib/format";
import { CATEGORIAS_INV, categoriaInv } from "@/lib/inventario";
import { ESTADOS_RESP, plantillaDefault, type EstadoResponsiva } from "@/lib/responsivas";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import AccesosEquipo from "@/components/AccesosEquipo";
import { crearEquipo, asignarEquipo, editarEquipo, eliminarEquipo } from "./actions";
import { generarResponsivaEquipo } from "../responsivas/actions";

export const dynamic = "force-dynamic";

const ESTADOS = ["activo", "en_reparacion", "almacen", "baja"];
const ETIQUETA_ESTADO: Record<string, string> = {
  activo: "Activo",
  en_reparacion: "En reparación",
  almacen: "Almacén",
  baja: "Baja",
};

// Días para considerar una garantía "por vencer" (resaltado sutil en la tabla).
const DIAS_GARANTIA = 90;

type Resp = {
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
  searchParams: Promise<{ cat?: string; q?: string; estado?: string; asignacion?: string; resguardo?: string }>;
}) {
  const { cat: catParam, q = "", estado = "", asignacion = "", resguardo } = await searchParams;
  const cat = categoriaInv(catParam);
  const c = cat.campos;

  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Inventario</h1>
        <p className="pagina-desc">Cómputo, celulares, líneas telefónicas y software</p>
      </div>
      <Link href="/ti/responsivas" className="boton secundario">Responsivas</Link>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const [equiposQ, empleadosQ, respQ] = await Promise.all([
    sb.from("equipos")
      .select("id, categoria, nombre, tipo, marca, modelo, num_serie, telefono, asignado_a, asignado_email, ubicacion, estado, fecha_compra, garantia_hasta, notas, accesos, created_at")
      .order("created_at", { ascending: false }),
    sb.from("empleados").select("nombre, correo").eq("estado", "activo").order("nombre"),
    sb.from("responsivas").select("id, equipo_id, plantilla, num, estado, archivo_url").order("created_at", { ascending: false }),
  ]);
  const todos = equiposQ.data ?? [];
  const empleados = empleadosQ.data ?? [];
  const responsivas = (respQ.data ?? []) as Resp[];

  // Responsiva más reciente por equipo (la lista ya viene de la más nueva a la más vieja).
  const respPorEquipo = new Map<string, Resp>();
  for (const r of responsivas) {
    if (r.equipo_id && !respPorEquipo.has(r.equipo_id)) respPorEquipo.set(r.equipo_id, r);
  }
  const respAviso = resguardo ? responsivas.find((r) => r.id === resguardo) : undefined;

  // Lista de la categoría actual; el resumen se calcula sobre ella (estable, sin búsqueda).
  const listaCat = todos.filter((e) => (e.categoria ?? "computo") === cat.valor);
  const resumen = {
    total: listaCat.length,
    activos: listaCat.filter((e) => e.estado === "activo").length,
    reparacion: listaCat.filter((e) => e.estado === "en_reparacion").length,
    libres: listaCat.filter((e) => !e.asignado_email && e.estado !== "baja").length,
    respPendientes: listaCat.filter((e) => e.asignado_email && !respPorEquipo.has(e.id)).length,
  };

  // Filtros (server, vía URL params). Se aplican sobre la lista de la categoría.
  const texto = q.trim().toLowerCase();
  let lista = listaCat;
  if (estado) lista = lista.filter((e) => e.estado === estado);
  if (asignacion === "libres") lista = lista.filter((e) => !e.asignado_email);
  if (asignacion === "asignados") lista = lista.filter((e) => e.asignado_email);
  if (texto) {
    lista = lista.filter((e) =>
      [e.nombre, e.marca, e.modelo, e.num_serie, e.telefono, e.asignado_a, e.asignado_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(texto),
    );
  }
  const hayFiltro = Boolean(texto || estado || asignacion);
  const hoy = new Date().toISOString().slice(0, 10);
  const limiteGarantia = new Date(Date.now() + DIAS_GARANTIA * 86400000).toISOString().slice(0, 10);

  const selectorEmpleado = (nombre: string, defaultValue?: string) => (
    <select name={nombre} defaultValue={defaultValue ?? ""}>
      <option value="">— Libre / sin asignar —</option>
      {empleados.map((p) => (
        <option key={p.correo} value={p.correo}>{p.nombre}</option>
      ))}
    </select>
  );

  return (
    <>
      {head}

      {respAviso && (
        <div className="banner-exito" style={{ marginBottom: 20 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div>
            <strong>Responsiva generada · {folioResponsiva(plantillaDefault(respAviso.plantilla).prefijoFolio, respAviso.num)}</strong>
            Quedó como borrador.{" "}
            <Link href={`/ti/responsivas/${respAviso.id}`} style={{ textDecoration: "underline" }}>Abrir y completar</Link>
            {" · "}
            <Link href={`/ti/responsivas/${respAviso.id}/imprimir`} style={{ textDecoration: "underline" }}>Imprimir</Link>
          </div>
        </div>
      )}

      <nav className="tabs" aria-label="Categorías del inventario">
        {CATEGORIAS_INV.map((t) => {
          const n = todos.filter((e) => (e.categoria ?? "computo") === t.valor).length;
          return (
            <Link
              key={t.valor}
              href={`/ti/inventario?cat=${t.valor}`}
              className={`tab ${t.valor === cat.valor ? "activo" : ""}`}
            >
              {t.etiqueta} <span className="tab-num">{n}</span>
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
          <div className={`metrica-valor ${resumen.reparacion ? "alerta" : ""}`}>{resumen.reparacion}</div>
          <div className="metrica-label">En reparación</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.libres}</div>
          <div className="metrica-label">{cat.valor === "celular" || cat.valor === "linea" ? "Libres" : "Sin asignar"}</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${resumen.respPendientes ? "alerta" : ""}`}>{resumen.respPendientes}</div>
          <div className="metrica-label">Resguardos pendientes</div>
        </div>
      </div>

      {/* Registrar: colapsado para que la lista sea la protagonista. */}
      <details className="plegable">
        <summary>Registrar {cat.singular}</summary>
        <form className="formulario plano" action={crearEquipo}>
          <input type="hidden" name="categoria" value={cat.valor} />
          <div className="campos">
            <div className="campo">
              <label htmlFor="eq-nombre">{c.nombre.label}</label>
              <input id="eq-nombre" name="nombre" placeholder={c.nombre.placeholder} required={cat.valor !== "linea"} />
            </div>
            {cat.tipos.length > 1 && (
              <div className="campo">
                <label htmlFor="eq-tipo">Tipo</label>
                <select id="eq-tipo" name="tipo" defaultValue={cat.tipos[0]}>
                  {cat.tipos.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </div>
            )}
            {c.marca && (
              <div className="campo">
                <label htmlFor="eq-marca">{c.marca.label}</label>
                <input id="eq-marca" name="marca" placeholder={c.marca.placeholder} />
              </div>
            )}
            {c.modelo && (
              <div className="campo">
                <label htmlFor="eq-modelo">{c.modelo.label}</label>
                <input id="eq-modelo" name="modelo" placeholder={c.modelo.placeholder} />
              </div>
            )}
            {c.num_serie && (
              <div className="campo">
                <label htmlFor="eq-serie">{c.num_serie.label}</label>
                <input id="eq-serie" name="num_serie" placeholder={c.num_serie.placeholder} />
              </div>
            )}
            {c.telefono && (
              <div className="campo">
                <label htmlFor="eq-telefono">{c.telefono.label}</label>
                <input id="eq-telefono" name="telefono" placeholder={c.telefono.placeholder} required={cat.valor === "linea"} />
              </div>
            )}
            <div className="campo">
              <label htmlFor="eq-empleado">Asignar a</label>
              {selectorEmpleado("empleado")}
            </div>
            {c.ubicacion && (
              <div className="campo">
                <label htmlFor="eq-ubicacion">Ubicación</label>
                <input id="eq-ubicacion" name="ubicacion" placeholder="Planta · Oficina" />
              </div>
            )}
            <div className="campo">
              <label htmlFor="eq-estado">Estado</label>
              <select id="eq-estado" name="estado" defaultValue="activo">
                {ESTADOS.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
              </select>
            </div>
            {c.fechas && (
              <>
                <div className="campo">
                  <label htmlFor="eq-compra">Fecha de compra</label>
                  <input id="eq-compra" name="fecha_compra" type="date" />
                </div>
                <div className="campo">
                  <label htmlFor="eq-garantia">{c.garantiaLabel}</label>
                  <input id="eq-garantia" name="garantia_hasta" type="date" />
                </div>
              </>
            )}
            <div className="campo ancho">
              <label htmlFor="eq-notas">Notas</label>
              <textarea id="eq-notas" name="notas" placeholder="Detalles, accesorios incluidos, historial…" />
            </div>
          </div>
          <AccesosEquipo />
          <p className="alta-nota suave">Si lo asignas a un empleado, se generará su responsiva en automático.</p>
          <BotonEnviar className="boton" ocupado="Guardando…">Guardar {cat.singular}</BotonEnviar>
        </form>
      </details>

      {/* Búsqueda y filtros (server, por URL). */}
      <div className="toolbar">
        <form className="filtros" method="get">
          <input type="hidden" name="cat" value={cat.valor} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, serie, número o empleado…"
            aria-label="Buscar en el inventario"
          />
          <select name="estado" defaultValue={estado} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
          </select>
          <select name="asignacion" defaultValue={asignacion} aria-label="Filtrar por asignación">
            <option value="">Asignados y libres</option>
            <option value="libres">Solo libres</option>
            <option value="asignados">Solo asignados</option>
          </select>
          <button className="boton secundario" type="submit">Filtrar</button>
          {hayFiltro && <Link href={`/ti/inventario?cat=${cat.valor}`} className="boton-texto">Limpiar</Link>}
        </form>
      </div>

      {lista.length === 0 ? (
        <div className="vacio">
          <strong>{hayFiltro ? "Sin coincidencias" : `Sin registros en ${cat.etiqueta.toLowerCase()}`}</strong>
          {hayFiltro ? "Ajusta la búsqueda o limpia los filtros." : "Registra el primero con el botón de arriba."}
        </div>
      ) : (
        <table className="tabla inv-tabla">
          <thead>
            <tr>
              <th>{cat.valor === "software" ? "Licencia" : "Equipo"}</th>
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
              const ins = r ? (ESTADOS_RESP[r.estado as EstadoResponsiva] ?? ESTADOS_RESP.borrador) : null;
              const porVencer = c.fechas && e.garantia_hasta && e.garantia_hasta >= hoy && e.garantia_hasta <= limiteGarantia;
              return (
                <tr key={e.id}>
                  <td data-label={cat.valor === "software" ? "Licencia" : "Equipo"}>
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
                  {c.num_serie && <td data-label={c.num_serie.label} className="mono">{e.num_serie ?? "—"}</td>}
                  {c.telefono && <td data-label={c.telefono.label} className="mono">{e.telefono ?? "—"}</td>}
                  <td data-label="Asignado a">
                    {e.asignado_email ? (
                      <span className="inv-asignado">
                        <span className="inv-avatar" aria-hidden>{iniciales(e.asignado_a ?? e.asignado_email)}</span>
                        <span>
                          <span className="inv-asignado-nombre">{e.asignado_a}</span>
                          <span className="suave" style={{ fontSize: 12, display: "block" }}>{e.asignado_email}</span>
                        </span>
                      </span>
                    ) : e.asignado_a ? (
                      <span className="suave">{e.asignado_a}</span>
                    ) : cat.valor === "celular" || cat.valor === "linea" ? (
                      <span className="insignia ok">libre</span>
                    ) : (
                      <span className="suave">—</span>
                    )}
                  </td>
                  <td data-label="Resguardo">
                    {r && ins ? (
                      <Link href={`/ti/responsivas/${r.id}`} className={`resguardo-chip ${ins.tono}`} title="Abrir responsiva">
                        <span className="punto" />{ins.texto}
                      </Link>
                    ) : e.asignado_email ? (
                      <form action={generarResponsivaEquipo}>
                        <input type="hidden" name="equipo_id" value={e.id} />
                        <BotonEnviar className="boton secundario mini" ocupado="…">Generar</BotonEnviar>
                      </form>
                    ) : (
                      <span className="suave">—</span>
                    )}
                  </td>
                  {c.ubicacion && <td data-label="Ubicación" className="suave">{e.ubicacion ?? "—"}</td>}
                  {c.fechas && (
                    <td data-label={c.garantiaLabel} className={`mono inv-garantia ${porVencer ? "por-vencer" : ""}`}>
                      {fechaCorta(e.garantia_hasta)}
                    </td>
                  )}
                  <td data-label="Estado"><Insignia valor={e.estado} /></td>
                  <td data-label="" className="inv-acciones-celda">
                    <details className="plegable interno editar">
                      <summary className="boton secundario mini">Gestionar</summary>
                      <div className="inv-gestionar">
                        {/* Editar: todos los campos. El hidden conserva la asignación actual
                            (editarEquipo desasigna si no recibe `empleado`). */}
                        <form action={editarEquipo} className="bloque-form">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="categoria" value={cat.valor} />
                          <input type="hidden" name="empleado" value={e.asignado_email ?? ""} />
                          <label className="mini-label">{c.nombre.label}</label>
                          <input name="nombre" defaultValue={e.nombre ?? ""} required={cat.valor !== "linea"} />
                          {cat.tipos.length > 1 && (
                            <>
                              <label className="mini-label">Tipo</label>
                              <select name="tipo" defaultValue={e.tipo}>
                                {cat.tipos.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                              </select>
                            </>
                          )}
                          {c.marca && (<><label className="mini-label">{c.marca.label}</label><input name="marca" defaultValue={e.marca ?? ""} /></>)}
                          {c.modelo && (<><label className="mini-label">{c.modelo.label}</label><input name="modelo" defaultValue={e.modelo ?? ""} /></>)}
                          {c.num_serie && (<><label className="mini-label">{c.num_serie.label}</label><input name="num_serie" defaultValue={e.num_serie ?? ""} /></>)}
                          {c.telefono && (<><label className="mini-label">{c.telefono.label}</label><input name="telefono" defaultValue={e.telefono ?? ""} required={cat.valor === "linea"} /></>)}
                          {c.ubicacion && (<><label className="mini-label">Ubicación</label><input name="ubicacion" defaultValue={e.ubicacion ?? ""} /></>)}
                          <label className="mini-label">Estado</label>
                          <select name="estado" defaultValue={e.estado}>
                            {ESTADOS.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
                          </select>
                          {c.fechas && (
                            <div className="dos-col">
                              <div>
                                <label className="mini-label">Compra</label>
                                <input name="fecha_compra" type="date" defaultValue={e.fecha_compra ?? ""} />
                              </div>
                              <div>
                                <label className="mini-label">{c.garantiaLabel}</label>
                                <input name="garantia_hasta" type="date" defaultValue={e.garantia_hasta ?? ""} />
                              </div>
                            </div>
                          )}
                          <label className="mini-label">Notas</label>
                          <textarea name="notas" defaultValue={e.notas ?? ""} rows={2} />
                          <AccesosEquipo valor={e.accesos} />
                          <BotonEnviar className="boton mini" ocupado="Guardando…">Guardar cambios</BotonEnviar>
                        </form>

                        {/* Asignar / liberar: vía asignarEquipo (genera la responsiva). */}
                        <form action={asignarEquipo} className="inv-gestionar-asignar">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="categoria" value={cat.valor} />
                          <label className="mini-label">Asignar / liberar</label>
                          {selectorEmpleado("empleado", e.asignado_email ?? "")}
                          <BotonEnviar className="boton secundario mini" ocupado="…">Aplicar</BotonEnviar>
                        </form>

                        <form action={eliminarEquipo} className="inv-gestionar-eliminar">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="categoria" value={cat.valor} />
                          <BotonEnviar className="boton-texto" style={{ color: "var(--critico)" }} ocupado="Eliminando…">
                            Eliminar {cat.singular}
                          </BotonEnviar>
                        </form>
                      </div>
                    </details>
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

// Iniciales para el avatar del asignado: "Luis Hernández" -> "LH".
function iniciales(s: string): string {
  return s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// Icono de línea por tipo de equipo (estático, fuera del render por fila).
function IconoTipo({ tipo }: { tipo: string | null }) {
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
        return <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M2 20h20" /></>;
      case "desktop":
        return <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>;
      case "monitor":
        return <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M9 21h6M12 17v4" /></>;
      case "impresora":
        return <><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M8 17h8v4H8z" /></>;
      case "red":
        return <><rect x="9" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M12 9v3M6 15v-3h12v3" /></>;
      case "servidor":
        return <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>;
      case "celular":
        return <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>;
      case "tablet":
        return <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M11 18h2" /></>;
      case "linea":
        return <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />;
      case "software":
        return <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10l-2 2 2 2M16 10l2 2-2 2M13 8l-2 8" /></>;
      case "perifericos":
        return <><rect x="8" y="3" width="8" height="18" rx="4" /><path d="M12 3v6" /></>;
      default:
        return <><path d="m21 8-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></>;
    }
  })();
  return <svg className="inv-tipo-icono" width="20" height="20" {...props}>{path}</svg>;
}
