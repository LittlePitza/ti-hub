import { getSupabase } from "@/lib/supabase/client";
import { dateTime, duration, incidentFolio } from "@/lib/utils/format";
import {
  servicesWithStatus,
  servicesSummary,
  incidentDuration,
  incidentTypeMeta,
  incidentStatusMeta,
  criticalityLabel,
  SERVICE_CATEGORIES,
  CRITICALITIES,
  INCIDENT_TYPES,
  type Service,
  type Incident,
  type ServiceWithStatus,
} from "@/lib/domain/services";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  createService,
  editService,
  deleteService,
  openIncident,
  monitorIncident,
  resolveIncident,
  reopenIncident,
  deleteIncident,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estado de sistemas" };

type IncidentWithService = Incident & { servicios: { nombre: string } | null };

export default async function EstadoSistemas() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Estado de sistemas</h1>
        <p className="pagina-desc">
          Servicios que la empresa usa a diario y el registro de sus caídas
        </p>
      </div>
    </div>
  );
  if (!sb)
    return (
      <>
        {head}
        <NoConnection />
      </>
    );

  const [serviciosQ, abiertosQ, historialQ] = await Promise.all([
    sb.from("servicios").select("*").order("orden"),
    sb
      .from("incidentes")
      .select("*")
      .neq("estado", "resuelto")
      .order("inicio", { ascending: false }),
    sb
      .from("incidentes")
      .select("*, servicios(nombre)")
      .eq("estado", "resuelto")
      .order("fin", { ascending: false })
      .limit(60),
  ]);

  const servicios = (serviciosQ.data ?? []) as Service[];
  const abiertos = (abiertosQ.data ?? []) as Incident[];
  const historial = (historialQ.data ?? []) as IncidentWithService[];

  const ahora = Date.now();
  // The board shows only active services; the status is derived from their open
  // incidents.
  const conEstado = servicesWithStatus(
    servicios.filter((s) => s.activo),
    abiertos,
  );
  const resumen = servicesSummary(conEstado);

  return (
    <>
      {head}

      {/* Hero: una sola frase que dice cómo está todo, con punto de estado vivo. */}
      <section
        className={`estado-hero ${resumen.todoBien ? "ok" : resumen.caidos > 0 ? "critico" : "aviso"}`}
      >
        <span
          className={`estado-punto grande ${resumen.todoBien ? "ok" : resumen.caidos > 0 ? "critico" : "aviso"}`}
          aria-hidden
        />
        <div className="estado-hero-texto">
          <h2 className="estado-hero-titulo">
            {resumen.todoBien
              ? "Todos los sistemas operativos"
              : resumen.caidos > 0
                ? `${resumen.caidos} ${resumen.caidos === 1 ? "servicio caído" : "servicios caídos"}`
                : `${resumen.afectados} ${resumen.afectados === 1 ? "servicio afectado" : "servicios afectados"}`}
          </h2>
          <p className="estado-hero-sub">
            {resumen.todoBien
              ? `${resumen.total} ${resumen.total === 1 ? "servicio monitoreado" : "servicios monitoreados"}, sin incidentes abiertos.`
              : `${resumen.operativos} de ${resumen.total} operativos. Atiende los incidentes abiertos abajo.`}
          </p>
        </div>
      </section>

      {/* Tablero: servicios agrupados por categoría. Los afectados muestran su
          incidente abierto en línea, con las acciones para cerrarlo. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Tablero</h2>
        {conEstado.length === 0 ? (
          <div className="vacio">
            <strong>Sin servicios en el catálogo</strong>
            Agrega los servicios que la empresa usa (internet, Microsoft, SAP…) en «Administrar
            servicios», más abajo.
          </div>
        ) : (
          <div className="estado-tablero">
            {SERVICE_CATEGORIES.map((cat) => {
              const items = conEstado.filter((s) => s.servicio.categoria === cat.value);
              if (items.length === 0) return null;
              return (
                <div className="estado-grupo" key={cat.value}>
                  <h3 className="estado-grupo-titulo eyebrow">{cat.label}</h3>
                  <div className="estado-lista">
                    {items.map((s) => (
                      <ServicioFila key={s.servicio.id} s={s} ahora={ahora} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Registrar una caída: la acción principal de esta pantalla. */}
      <form className="formulario" action={openIncident}>
        <h2>Registrar caída o falla</h2>
        <div className="campos">
          <div className="campo">
            <label htmlFor="inc-servicio">Servicio afectado</label>
            <select id="inc-servicio" name="servicio_id" required defaultValue="">
              <option value="" disabled>
                Elige un servicio…
              </option>
              {servicios
                .filter((s) => s.activo)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="inc-tipo">Tipo</label>
            <select id="inc-tipo" name="tipo" defaultValue="caida">
              {INCIDENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="inc-inicio">Comenzó</label>
            <input id="inc-inicio" name="inicio" type="datetime-local" />
          </div>
          <div className="campo ancho">
            <label htmlFor="inc-titulo">Qué está pasando</label>
            <input
              id="inc-titulo"
              name="titulo"
              required
              placeholder="Sin internet en toda la planta"
            />
          </div>
          <div className="campo ancho">
            <label htmlFor="inc-desc">Detalle (opcional)</label>
            <textarea
              id="inc-desc"
              name="descripcion"
              placeholder="Qué se ve, a quién afecta, qué se está revisando…"
            />
          </div>
        </div>
        <SubmitButton className="boton" ocupado="Registrando…">
          Registrar caída
        </SubmitButton>
      </form>

      {/* Historial: incidentes ya resueltos, del más reciente al más viejo. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Historial de incidentes</h2>
        {historial.length === 0 ? (
          <div className="vacio">
            Aún no hay incidentes resueltos. Los que registres aparecerán aquí al cerrarlos.
          </div>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Servicio</th>
                <th>Incidente</th>
                <th>Tipo</th>
                <th>Duración</th>
                <th>Resuelto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((i) => {
                const tipo = incidentTypeMeta(i.tipo);
                return (
                  <tr key={i.id}>
                    <td className="mono">{incidentFolio(i.num)}</td>
                    <td className="suave">{i.servicios?.nombre ?? "—"}</td>
                    <td>
                      <div className="celda-principal">{i.titulo}</div>
                      {i.resolucion && (
                        <div className="suave" style={{ fontSize: 12.5 }}>
                          {i.resolucion}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`insignia ${tipo.tone}`}>{tipo.label}</span>
                    </td>
                    <td className="mono">{duration(incidentDuration(i, ahora))}</td>
                    <td className="suave mono" style={{ whiteSpace: "nowrap" }}>
                      {dateTime(i.fin)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="fila-acciones">
                        <form action={reopenIncident}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton className="boton secundario mini" ocupado="…">
                            Reabrir
                          </SubmitButton>
                        </form>
                        <form action={deleteIncident}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton
                            className="boton secundario mini"
                            style={{ color: "var(--critico)" }}
                            ocupado="…"
                          >
                            Eliminar
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Administrar el catálogo de servicios (plegado por defecto). */}
      <section className="seccion">
        <details className="plegable">
          <summary>Administrar servicios</summary>
          <div style={{ marginTop: 14 }}>
            <form className="bloque-form" action={createService} style={{ marginBottom: 18 }}>
              <div className="dos-col">
                <div>
                  <label className="mini-label" htmlFor="sv-nombre">
                    Nombre
                  </label>
                  <input
                    id="sv-nombre"
                    name="nombre"
                    required
                    placeholder="SAP, Internet, Microsoft 365…"
                  />
                </div>
                <div>
                  <label className="mini-label" htmlFor="sv-proveedor">
                    Proveedor (opcional)
                  </label>
                  <input id="sv-proveedor" name="proveedor" placeholder="Telmex, Microsoft…" />
                </div>
              </div>
              <div className="dos-col">
                <div>
                  <label className="mini-label" htmlFor="sv-categoria">
                    Categoría
                  </label>
                  <select id="sv-categoria" name="categoria" defaultValue="plataforma">
                    {SERVICE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mini-label" htmlFor="sv-criticidad">
                    Criticidad
                  </label>
                  <select id="sv-criticidad" name="criticidad" defaultValue="normal">
                    {CRITICALITIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="mini-label" htmlFor="sv-desc">
                Descripción (opcional)
              </label>
              <input id="sv-desc" name="descripcion" placeholder="Para qué se usa" />
              <label className="check-linea">
                <input type="checkbox" name="visible_portal" defaultChecked />
                Avisar a los empleados en el portal cuando este servicio se caiga
              </label>
              <SubmitButton className="boton mini" ocupado="Agregando…">
                Agregar servicio
              </SubmitButton>
            </form>

            <table className="tabla">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Categoría</th>
                  <th>Criticidad</th>
                  <th>Portal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {servicios.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="celda-principal">
                        {s.nombre}
                        {!s.activo && (
                          <span className="insignia neutro" style={{ marginLeft: 8 }}>
                            inactivo
                          </span>
                        )}
                      </div>
                      {s.proveedor && (
                        <div className="suave" style={{ fontSize: 12.5 }}>
                          {s.proveedor}
                        </div>
                      )}
                    </td>
                    <td className="suave">
                      {SERVICE_CATEGORIES.find((c) => c.value === s.categoria)?.label ??
                        s.categoria}
                    </td>
                    <td className="suave">{criticalityLabel(s.criticidad)}</td>
                    <td className="suave">{s.visible_portal ? "Sí" : "No"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="fila-acciones">
                        <details className="plegable interno editar">
                          <summary className="boton secundario mini">Editar</summary>
                          <form action={editService} className="bloque-form panel-editar">
                            <input type="hidden" name="id" value={s.id} />
                            <label className="mini-label">Nombre</label>
                            <input name="nombre" defaultValue={s.nombre} required />
                            <div className="dos-col">
                              <div>
                                <label className="mini-label">Categoría</label>
                                <select name="categoria" defaultValue={s.categoria}>
                                  {SERVICE_CATEGORIES.map((c) => (
                                    <option key={c.value} value={c.value}>
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="mini-label">Criticidad</label>
                                <select name="criticidad" defaultValue={s.criticidad}>
                                  {CRITICALITIES.map((c) => (
                                    <option key={c.value} value={c.value}>
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <label className="mini-label">Proveedor</label>
                            <input name="proveedor" defaultValue={s.proveedor ?? ""} />
                            <label className="mini-label">Descripción</label>
                            <input name="descripcion" defaultValue={s.descripcion ?? ""} />
                            <label className="mini-label">Orden</label>
                            <input name="orden" type="number" defaultValue={s.orden} />
                            <label className="check-linea">
                              <input
                                type="checkbox"
                                name="visible_portal"
                                defaultChecked={s.visible_portal}
                              />
                              Visible en el portal del empleado
                            </label>
                            <SubmitButton className="boton mini" ocupado="Guardando…">
                              Guardar
                            </SubmitButton>
                          </form>
                        </details>
                        <form action={deleteService}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton
                            className="boton secundario mini"
                            style={{ color: "var(--critico)" }}
                            ocupado="…"
                            title="Borra el servicio y su historial de incidentes"
                          >
                            Eliminar
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}

// One board row: the service, its status, and its open incidents inline.
function ServicioFila({ s, ahora }: { s: ServiceWithStatus; ahora: number }) {
  const { servicio, estado, incidentesAbiertos } = s;
  return (
    <div className={`estado-fila ${estado.value}`}>
      <div className="estado-fila-cab">
        <span className={`estado-punto ${estado.tone}`} aria-hidden />
        <div className="estado-fila-id">
          <span className="estado-fila-nombre">{servicio.nombre}</span>
          {servicio.descripcion && <span className="estado-fila-desc">{servicio.descripcion}</span>}
        </div>
        <span className={`insignia ${estado.tone}`}>{estado.label}</span>
      </div>

      {incidentesAbiertos.map((i) => {
        const tipo = incidentTypeMeta(i.tipo);
        const est = incidentStatusMeta(i.estado);
        return (
          <div className="incidente-linea" key={i.id}>
            <div className="incidente-linea-cuerpo">
              <div className="incidente-linea-cab">
                <span className={`insignia ${tipo.tone}`}>{tipo.label}</span>
                <span className="mono suave" style={{ fontSize: 12.5 }}>
                  {incidentFolio(i.num)}
                </span>
                <span className={`insignia ${est.tone}`}>{est.label}</span>
              </div>
              <div className="incidente-linea-titulo">{i.titulo}</div>
              {i.descripcion && (
                <div className="suave" style={{ fontSize: 13 }}>
                  {i.descripcion}
                </div>
              )}
              <div className="incidente-linea-meta">
                Desde {dateTime(i.inicio)} · <b>{duration(incidentDuration(i, ahora))}</b> sin
                servicio
              </div>
            </div>
            <div className="incidente-linea-acciones">
              {i.estado === "activo" && (
                <form action={monitorIncident}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton
                    className="boton secundario mini"
                    ocupado="…"
                    title="Ya se restableció pero sigues observando"
                  >
                    Vigilando
                  </SubmitButton>
                </form>
              )}
              <details className="plegable interno editar">
                <summary className="boton mini">Resolver</summary>
                <form action={resolveIncident} className="bloque-form panel-editar">
                  <input type="hidden" name="id" value={i.id} />
                  <label className="mini-label">Cómo se resolvió (opcional)</label>
                  <textarea
                    name="resolucion"
                    rows={2}
                    placeholder="Qué se hizo para restablecerlo"
                  />
                  <label className="mini-label">Terminó (opcional, por defecto ahora)</label>
                  <input name="fin" type="datetime-local" />
                  <SubmitButton className="boton mini" ocupado="Resolviendo…">
                    Marcar resuelto
                  </SubmitButton>
                </form>
              </details>
            </div>
          </div>
        );
      })}
    </div>
  );
}
