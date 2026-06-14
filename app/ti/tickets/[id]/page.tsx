import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { fechaHora, folio, duracion } from "@/lib/format";
import {
  ESTADOS_TICKET,
  PRIORIDADES,
  CATEGORIAS_TK,
  SLA,
  metaEstado,
  evaluarRespuesta,
  evaluarResolucion,
  type Prioridad,
} from "@/lib/tickets";
import Insignia from "@/components/Insignia";
import PildoraSla from "@/components/PildoraSla";
import SinConexion from "@/components/SinConexion";
import {
  editarTicket,
  cambiarEstadoTicket,
  asignarTicket,
  agregarComentario,
  eliminarTicket,
} from "../actions";

export const dynamic = "force-dynamic";

const ICONO_EVENTO: Record<string, string> = {
  comentario: "💬",
  estado: "⇄",
  asignacion: "👤",
  sistema: "•",
};

export default async function DetalleTicket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await getSupabase();
  if (!sb) {
    return (
      <>
        <div className="pagina-head"><div><h1 className="pagina-titulo">Ticket</h1></div></div>
        <SinConexion />
      </>
    );
  }

  const { data: t } = await sb
    .from("tickets")
    .select("*, equipos(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const { data: eventosData } = await sb
    .from("ticket_eventos")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: false });
  const eventos = eventosData ?? [];

  const ahora = Date.now();
  const resp = evaluarRespuesta(t, ahora);
  const reso = evaluarResolucion(t, ahora);
  const objetivo = SLA[(t.prioridad as Prioridad)] ?? SLA.media;
  const finRef = t.resuelto_at ? new Date(t.resuelto_at).getTime() : ahora;
  const tiempoAbierto = finRef - new Date(t.created_at).getTime();
  const meta = metaEstado(t.estado);

  return (
    <>
      <div className="pagina-head detalle-head">
        <div>
          <Link href="/ti/tickets" className="boton-texto">← Tickets</Link>
          <h1 className="pagina-titulo" style={{ marginTop: 6 }}>
            <span className="mono">{folio(t.num)}</span> · {t.titulo}
          </h1>
          <div className="detalle-badges">
            <Insignia valor={t.estado} />
            <Insignia valor={t.prioridad} esPrioridad />
            <span className="insignia neutro">{t.categoria}</span>
          </div>
        </div>
      </div>

      {/* Métricas de atención / SLA */}
      <div className="metricas-sla">
        <div className="metrica-sla">
          <div className="metrica-sla-label">Primera respuesta</div>
          <div className="metrica-sla-valor">{resp.pendiente && resp.semaforo !== "pausado" ? duracion(resp.ms) : resp.pendiente ? "—" : duracion(resp.ms)}</div>
          <PildoraSla semaforo={resp.semaforo} />
          <div className="suave" style={{ fontSize: 11.5 }}>Objetivo: {objetivo.respuesta} h</div>
        </div>
        <div className="metrica-sla">
          <div className="metrica-sla-label">Resolución</div>
          <div className="metrica-sla-valor">{reso.pendiente ? "—" : reso.semaforo === "na" ? "—" : duracion(reso.ms)}</div>
          <PildoraSla semaforo={reso.semaforo} />
          <div className="suave" style={{ fontSize: 11.5 }}>Objetivo: {objetivo.resolucion} h</div>
        </div>
        <div className="metrica-sla">
          <div className="metrica-sla-label">{t.resuelto_at ? "Tiempo total" : "Tiempo abierto"}</div>
          <div className="metrica-sla-valor">{duracion(tiempoAbierto)}</div>
          <div className="suave" style={{ fontSize: 11.5 }}>Creado {fechaHora(t.created_at)}</div>
        </div>
      </div>

      <div className="detalle-grid">
        {/* Columna principal: descripción + bitácora */}
        <div className="detalle-principal">
          <section className="tarjeta-detalle">
            <h2 className="seccion-titulo">Descripción</h2>
            <p className={t.descripcion ? "" : "suave"}>
              {t.descripcion || "Sin descripción."}
            </p>
            {t.equipos?.nombre && (
              <p className="suave mono" style={{ marginTop: 10 }}>Equipo relacionado: {t.equipos.nombre}</p>
            )}
          </section>

          <section className="tarjeta-detalle">
            <h2 className="seccion-titulo">Actividad</h2>
            <form action={agregarComentario} className="comentario-form">
              <input type="hidden" name="id" value={t.id} />
              <textarea name="cuerpo" required placeholder="Agregar un comentario o nota interna…" />
              <button className="boton" type="submit">Comentar</button>
            </form>

            {eventos.length === 0 ? (
              <div className="vacio">Sin movimientos todavía.</div>
            ) : (
              <ol className="bitacora">
                {eventos.map((e: any) => (
                  <li key={e.id} className={`bitacora-item tipo-${e.tipo}`}>
                    <span className="bitacora-icono" aria-hidden>{ICONO_EVENTO[e.tipo] ?? "•"}</span>
                    <div className="bitacora-cuerpo">
                      <div className="bitacora-meta">
                        <strong>{e.autor ?? "TI"}</strong>
                        <span className="suave mono">{fechaHora(e.created_at)}</span>
                      </div>
                      {e.tipo === "estado" && (
                        <div className="bitacora-texto">
                          Cambió el estado: <Insignia valor={e.estado_anterior} /> → <Insignia valor={e.estado_nuevo} />
                        </div>
                      )}
                      {e.cuerpo && <div className="bitacora-texto">{e.cuerpo}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Columna lateral: acciones */}
        <aside className="detalle-aside">
          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Cambiar estado</h3>
            <form action={cambiarEstadoTicket} className="bloque-form">
              <input type="hidden" name="id" value={t.id} />
              <select name="estado" defaultValue={t.estado}>
                {ESTADOS_TICKET.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
              </select>
              <textarea name="nota" placeholder="Nota del cambio (opcional)" rows={2} />
              <button className="boton" type="submit">Guardar estado</button>
            </form>
          </section>

          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Asignación</h3>
            <form action={asignarTicket} className="bloque-form">
              <input type="hidden" name="id" value={t.id} />
              <input name="asignado_a" defaultValue={t.asignado_a ?? ""} placeholder="Técnico responsable" />
              <button className="boton secundario" type="submit">Asignar</button>
            </form>
          </section>

          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Datos</h3>
            <dl className="datos-lista">
              <dt>Solicitante</dt><dd>{t.solicitante}</dd>
              {t.solicitante_email && (<><dt>Correo</dt><dd className="mono">{t.solicitante_email}</dd></>)}
              <dt>Estado</dt><dd>{meta.etiqueta}</dd>
              <dt>Actualizado</dt><dd className="mono">{fechaHora(t.updated_at)}</dd>
            </dl>

            <details className="plegable interno">
              <summary>Editar ticket</summary>
              <form action={editarTicket} className="bloque-form" style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={t.id} />
                <label className="mini-label">Asunto</label>
                <input name="titulo" defaultValue={t.titulo} required />
                <label className="mini-label">Solicitante</label>
                <input name="solicitante" defaultValue={t.solicitante} required />
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Categoría</label>
                    <select name="categoria" defaultValue={t.categoria}>
                      {CATEGORIAS_TK.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">Prioridad</label>
                    <select name="prioridad" defaultValue={t.prioridad}>
                      {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <label className="mini-label">Asignado a</label>
                <input name="asignado_a" defaultValue={t.asignado_a ?? ""} />
                <label className="mini-label">Descripción</label>
                <textarea name="descripcion" defaultValue={t.descripcion ?? ""} rows={4} />
                <button className="boton" type="submit">Guardar cambios</button>
              </form>
            </details>

            <details className="plegable interno zona-peligro">
              <summary>Eliminar ticket</summary>
              <form action={eliminarTicket} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="desde" value="detalle" />
                <p className="suave" style={{ fontSize: 12.5, marginBottom: 8 }}>
                  Esta acción es permanente y borra también su bitácora.
                </p>
                <button className="boton secundario" type="submit" style={{ color: "var(--critico)" }}>
                  Eliminar definitivamente
                </button>
              </form>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
