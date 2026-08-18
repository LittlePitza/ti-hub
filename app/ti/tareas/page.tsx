import { getSupabase } from "@/lib/supabase";
import { fechaCorta } from "@/lib/format";
import { hoyISO } from "@/lib/facturas";
import {
  agruparPendientes,
  progresoProyecto,
  resumenTareas,
  tareaVencida,
  metaEstadoProyecto,
  ESTADOS_PROYECTO,
  type Tarea,
  type Proyecto,
} from "@/lib/tareas";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import {
  crearTarea,
  alternarTarea,
  editarTarea,
  eliminarTarea,
  crearProyecto,
  editarProyecto,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tareas y proyectos" };

export default async function TareasProyectos() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Tareas y proyectos</h1>
        <p className="pagina-desc">
          La agenda de trabajo del equipo de TI: pendientes del día y avance de proyectos
        </p>
      </div>
    </div>
  );
  if (!sb)
    return (
      <>
        {head}
        <SinConexion />
      </>
    );

  const [tareasQ, proyectosQ] = await Promise.all([
    sb.from("tareas").select("*").order("created_at", { ascending: false }),
    sb.from("proyectos").select("*").order("created_at", { ascending: false }),
  ]);

  const tareas = (tareasQ.data ?? []) as Tarea[];
  const proyectos = (proyectosQ.data ?? []) as Proyecto[];
  const hoy = hoyISO();

  const resumen = resumenTareas(tareas, hoy);
  const grupos = agruparPendientes(tareas, hoy);
  const completadas = tareas
    .filter((t) => t.completada_at)
    .sort((a, b) => (b.completada_at ?? "").localeCompare(a.completada_at ?? ""))
    .slice(0, 15);

  const nombrePorProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]));
  // Proyectos no archivados arriba en los selectores; los archivados solo en su tarjeta.
  const proyectosVigentes = proyectos.filter((p) => p.estado !== "archivado");

  // Opciones de proyecto reutilizables (bandeja + cada proyecto vigente). La
  // selección la controla el `defaultValue` del <select> que las envuelve.
  const opcionesProyecto = () => (
    <>
      <option value="">Bandeja (sin proyecto)</option>
      {proyectosVigentes.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </>
  );

  return (
    <>
      {head}

      {/* Resumen: la carga de pendientes de un vistazo. */}
      <section className="metricas">
        <div className="metrica">
          <div className="metrica-valor">{resumen.pendientes}</div>
          <div className="metrica-label">Pendientes</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${resumen.vencidas > 0 ? "alerta" : ""}`}>
            {resumen.vencidas}
          </div>
          <div className="metrica-label">Vencidas</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.hoy}</div>
          <div className="metrica-label">Para hoy</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.hechasSemana}</div>
          <div className="metrica-label">Hechas esta semana</div>
        </div>
      </section>

      {/* Captura rápida: la fricción mínima para anotar un pendiente. */}
      <form className="tarea-rapida" action={crearTarea}>
        <input
          name="titulo"
          required
          placeholder="Anota un pendiente y presiona Agregar…"
          className="tarea-rapida-titulo"
          aria-label="Nueva tarea"
        />
        <select name="proyecto_id" aria-label="Proyecto">
          {opcionesProyecto()}
        </select>
        <select name="prioridad" defaultValue="normal" aria-label="Prioridad">
          <option value="normal">Normal</option>
          <option value="alta">Alta</option>
        </select>
        <input name="fecha_limite" type="date" aria-label="Fecha límite" />
        <BotonEnviar className="boton" ocupado="Agregando…">
          Agregar
        </BotonEnviar>
      </form>

      <div className="dash-cols">
        {/* Columna principal: la lista de pendientes por vencimiento. */}
        <div className="dash-main">
          <section className="seccion">
            <h2 className="seccion-titulo">Por hacer</h2>
            {grupos.length === 0 ? (
              <div className="vacio">
                <strong>Sin pendientes</strong>
                Todo al día. Cuando anotes una tarea aparecerá aquí, agrupada por cuándo vence.
              </div>
            ) : (
              grupos.map((g) => (
                <div className="tareas-grupo" key={g.cubo}>
                  <div className="tareas-grupo-cab">
                    <span className={`estado-punto ${g.tono}`} aria-hidden />
                    <span className="eyebrow">{g.etiqueta}</span>
                    <span className="tareas-grupo-num">{g.tareas.length}</span>
                  </div>
                  <div className="tareas-lista">
                    {g.tareas.map((t) => (
                      <TareaFila
                        key={t.id}
                        t={t}
                        hoy={hoy}
                        nombreProyecto={
                          t.proyecto_id ? nombrePorProyecto.get(t.proyecto_id) : undefined
                        }
                        opcionesProyecto={opcionesProyecto}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}

            {completadas.length > 0 && (
              <details className="plegable" style={{ marginTop: 16 }}>
                <summary>Completadas recientemente ({completadas.length})</summary>
                <div className="tareas-lista" style={{ marginTop: 12 }}>
                  {completadas.map((t) => (
                    <div className="tarea hecha" key={t.id}>
                      <form action={alternarTarea} className="tarea-check-form">
                        <input type="hidden" name="id" value={t.id} />
                        <BotonEnviar
                          className="tarea-check hecha"
                          ocupado=""
                          aria-label="Reabrir tarea"
                          title="Reabrir"
                        >
                          <IconoCheck />
                        </BotonEnviar>
                      </form>
                      <div className="tarea-cuerpo">
                        <span className="tarea-titulo">{t.titulo}</span>
                        <span className="tarea-meta">
                          {t.proyecto_id && nombrePorProyecto.get(t.proyecto_id) && (
                            <span className="tarea-chip">
                              {nombrePorProyecto.get(t.proyecto_id)}
                            </span>
                          )}
                          <span className="suave">Completada {fechaCorta(t.completada_at)}</span>
                        </span>
                      </div>
                      <form action={eliminarTarea} className="tarea-acciones">
                        <input type="hidden" name="id" value={t.id} />
                        <BotonEnviar
                          className="boton secundario mini"
                          style={{ color: "var(--critico)" }}
                          ocupado="…"
                        >
                          Eliminar
                        </BotonEnviar>
                      </form>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        </div>

        {/* Aside: proyectos con su avance. */}
        <aside className="dash-aside">
          <section className="seccion">
            <h2 className="seccion-titulo">Proyectos</h2>
            {proyectos.length === 0 ? (
              <div className="vacio">
                Sin proyectos. Crea uno para agrupar tareas grandes (migraciones, altas,
                despliegues).
              </div>
            ) : (
              <div className="proyectos-lista">
                {proyectos.map((p) => {
                  const tareasP = tareas.filter((t) => t.proyecto_id === p.id);
                  const prog = progresoProyecto(tareasP, hoy);
                  const est = metaEstadoProyecto(p.estado);
                  return (
                    <div className="proyecto-card" key={p.id}>
                      <div className="proyecto-card-cab">
                        <h3 className="proyecto-card-nombre">{p.nombre}</h3>
                        <span className={`insignia ${est.tono}`}>{est.etiqueta}</span>
                      </div>
                      {p.descripcion && <p className="proyecto-card-desc">{p.descripcion}</p>}
                      <div
                        className="proyecto-barra"
                        role="img"
                        aria-label={`${prog.pct}% completado`}
                      >
                        <div className="proyecto-barra-fill" style={{ width: `${prog.pct}%` }} />
                      </div>
                      <div className="proyecto-card-meta">
                        <span>
                          <b>{prog.hechas}</b>/{prog.total} tareas
                        </span>
                        {prog.vencidas > 0 && (
                          <span className="fecha-vencida">{prog.vencidas} vencidas</span>
                        )}
                        {p.fecha_objetivo && (
                          <span className="suave">Objetivo {fechaCorta(p.fecha_objetivo)}</span>
                        )}
                      </div>
                      <details className="plegable interno editar" style={{ marginTop: 8 }}>
                        <summary className="boton secundario mini">Editar</summary>
                        <form action={editarProyecto} className="bloque-form panel-editar">
                          <input type="hidden" name="id" value={p.id} />
                          <label className="mini-label">Nombre</label>
                          <input name="nombre" defaultValue={p.nombre} required />
                          <label className="mini-label">Descripción</label>
                          <input name="descripcion" defaultValue={p.descripcion ?? ""} />
                          <div className="dos-col">
                            <div>
                              <label className="mini-label">Estado</label>
                              <select name="estado" defaultValue={p.estado}>
                                {ESTADOS_PROYECTO.map((e) => (
                                  <option key={e.valor} value={e.valor}>
                                    {e.etiqueta}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mini-label">Objetivo</label>
                              <input
                                name="fecha_objetivo"
                                type="date"
                                defaultValue={p.fecha_objetivo ?? ""}
                              />
                            </div>
                          </div>
                          <div className="fila-acciones" style={{ marginTop: 8 }}>
                            <BotonEnviar className="boton mini" ocupado="Guardando…">
                              Guardar
                            </BotonEnviar>
                          </div>
                        </form>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}

            <details className="plegable" style={{ marginTop: 14 }}>
              <summary>Nuevo proyecto</summary>
              <form action={crearProyecto} className="bloque-form" style={{ marginTop: 12 }}>
                <label className="mini-label" htmlFor="pr-nombre">
                  Nombre
                </label>
                <input
                  id="pr-nombre"
                  name="nombre"
                  required
                  placeholder="Migración de correo a M365"
                />
                <label className="mini-label" htmlFor="pr-desc">
                  Descripción (opcional)
                </label>
                <input id="pr-desc" name="descripcion" placeholder="Objetivo del proyecto" />
                <label className="mini-label" htmlFor="pr-fecha">
                  Fecha objetivo (opcional)
                </label>
                <input id="pr-fecha" name="fecha_objetivo" type="date" />
                <BotonEnviar className="boton mini" ocupado="Creando…">
                  Crear proyecto
                </BotonEnviar>
              </form>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}

function TareaFila({
  t,
  hoy,
  nombreProyecto,
  opcionesProyecto,
}: {
  t: Tarea;
  hoy: string;
  nombreProyecto?: string;
  opcionesProyecto: (sel?: string | null) => React.ReactNode;
}) {
  const vencida = tareaVencida(t, hoy);
  return (
    <div className="tarea">
      <form action={alternarTarea} className="tarea-check-form">
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="completar" value="on" />
        <BotonEnviar
          className="tarea-check"
          ocupado=""
          aria-label="Marcar como completada"
          title="Completar"
        >
          <span className="tarea-check-circulo" aria-hidden />
        </BotonEnviar>
      </form>
      <div className="tarea-cuerpo">
        <span className="tarea-titulo">
          {t.prioridad === "alta" && (
            <span className="tarea-alta" title="Prioridad alta" aria-label="Prioridad alta">
              !
            </span>
          )}
          {t.titulo}
        </span>
        <span className="tarea-meta">
          {nombreProyecto && <span className="tarea-chip">{nombreProyecto}</span>}
          {t.fecha_limite && (
            <span className={vencida ? "fecha-vencida" : "suave"}>
              {fechaCorta(t.fecha_limite)}
            </span>
          )}
          {t.notas && <span className="suave tarea-notas">{t.notas}</span>}
        </span>
      </div>
      <div className="tarea-acciones">
        <details className="plegable interno editar">
          <summary className="boton secundario mini">Editar</summary>
          <form action={editarTarea} className="bloque-form panel-editar">
            <input type="hidden" name="id" value={t.id} />
            <label className="mini-label">Tarea</label>
            <input name="titulo" defaultValue={t.titulo} required />
            <label className="mini-label">Notas</label>
            <textarea name="notas" defaultValue={t.notas ?? ""} rows={2} />
            <div className="dos-col">
              <div>
                <label className="mini-label">Proyecto</label>
                <select name="proyecto_id" defaultValue={t.proyecto_id ?? ""}>
                  {opcionesProyecto(t.proyecto_id)}
                </select>
              </div>
              <div>
                <label className="mini-label">Prioridad</label>
                <select name="prioridad" defaultValue={t.prioridad}>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
            </div>
            <label className="mini-label">Fecha límite</label>
            <input name="fecha_limite" type="date" defaultValue={t.fecha_limite ?? ""} />
            <BotonEnviar className="boton mini" ocupado="Guardando…">
              Guardar
            </BotonEnviar>
          </form>
        </details>
        <form action={eliminarTarea}>
          <input type="hidden" name="id" value={t.id} />
          <BotonEnviar
            className="boton secundario mini"
            style={{ color: "var(--critico)" }}
            ocupado="…"
            title="Eliminar tarea"
          >
            ✕
          </BotonEnviar>
        </form>
      </div>
    </div>
  );
}

function IconoCheck() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
