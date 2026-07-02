import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { fechaHora, folio, duracion } from "@/lib/format";
import {
  ESTADOS_TICKET,
  ESTADOS_SELECCIONABLES,
  PRIORIDADES,
  CATEGORIAS_TK,
  metaEstado,
  evaluarRespuesta,
  evaluarResolucion,
} from "@/lib/tickets";
import { correoValido } from "@/lib/portal";
import type { Adjunto } from "@/lib/adjuntos";
import { getConfigCorreo, correoOperativo, resolverSla } from "@/lib/correo";
import Insignia from "@/components/Insignia";
import PildoraSla from "@/components/PildoraSla";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import {
  editarTicket,
  cambiarEstadoTicket,
  asignarTicket,
  agregarComentario,
  responderCliente,
  eliminarTicket,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

// Cada evento de la bitácora trae icono, etiqueta y tono. `respuesta` es el único
// visible para el solicitante; el resto es interno.
const META_EVENTO: Record<string, { icono: string; etiqueta: string }> = {
  respuesta: { icono: "↩", etiqueta: "Respuesta al solicitante" },
  mensaje_cliente: { icono: "📨", etiqueta: "Mensaje del solicitante" },
  comentario: { icono: "💬", etiqueta: "Nota interna" },
  estado: { icono: "⇄", etiqueta: "Cambio de estado" },
  asignacion: { icono: "👤", etiqueta: "Asignación" },
  sistema: { icono: "•", etiqueta: "Sistema" },
};

const iniciales = (s: string) =>
  s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

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

  // Ticket, bitácora y configuración no dependen entre sí: una sola ronda a la BD.
  const [{ data: t }, { data: eventosData }, config] = await Promise.all([
    sb.from("tickets").select("*, equipos(nombre)").eq("id", id).maybeSingle(),
    sb.from("ticket_eventos").select("*").eq("ticket_id", id).order("created_at", { ascending: false }),
    getConfigCorreo(sb),
  ]);
  if (!t) notFound();
  const eventos = eventosData ?? [];

  // Fotos que adjuntó el solicitante al reportar: bucket privado, URLs firmadas.
  const adjuntos: Adjunto[] = Array.isArray(t.adjuntos) ? t.adjuntos : [];
  const fotos = (
    await Promise.all(
      adjuntos.map(async (a) => {
        const { data } = await sb.storage.from("tickets").createSignedUrl(a.path, 3600);
        return data?.signedUrl ? { url: data.signedUrl, nombre: a.nombre } : null;
      }),
    )
  ).filter((f): f is { url: string; nombre: string } => f !== null);

  const ahora = Date.now();
  const { sla, porVencerPct } = resolverSla(config);
  const resp = evaluarRespuesta(t, ahora, sla, porVencerPct);
  const reso = evaluarResolucion(t, ahora, sla, porVencerPct);
  const objetivo = sla[t.prioridad as keyof typeof sla] ?? sla.media;
  const finRef = t.resuelto_at ? new Date(t.resuelto_at).getTime() : ahora;
  const tiempoAbierto = finRef - new Date(t.created_at).getTime();
  const meta = metaEstado(t.estado);
  const respondidos = eventos.filter((e: any) => e.tipo === "respuesta").length;

  // Notificación por correo: opcional (casilla) y solo posible si el servicio está
  // operativo y el solicitante tiene correo. La precarga sale de la config del panel.
  const operativo = correoOperativo(config);
  const emailDestino = correoValido(t.solicitante_email ?? "") ? (t.solicitante_email as string) : null;
  const puedeNotificar = Boolean(operativo && emailDestino);
  const defResp = config?.notif_respuesta_def ?? true;
  const defEstado = config?.notif_estado_def ?? false;

  return (
    <>
      {/* Tarjeta de encabezado: toda la información del ticket de un vistazo */}
      <section className="ticket-encabezado detalle-head">
        <Link href="/ti/tickets" className="boton-texto">← Tickets</Link>
        <div className="ticket-enc-top">
          <div className="ticket-enc-id">
            <span className="ticket-enc-folio mono">{folio(t.num)}</span>
            <h1 className="ticket-enc-titulo">{t.titulo}</h1>
          </div>
          <div className="detalle-badges">
            <Insignia valor={t.estado} />
            <Insignia valor={t.prioridad} esPrioridad />
            <span className="insignia neutro">{t.categoria}</span>
          </div>
        </div>

        <dl className="ticket-enc-meta">
          <div className="enc-dato">
            <dt>Solicitante</dt>
            <dd>
              {t.solicitante}
              {t.solicitante_email && <span className="enc-sub mono">{t.solicitante_email}</span>}
            </dd>
          </div>
          <div className="enc-dato">
            <dt>Asignado a</dt>
            <dd>
              {t.asignado_a ? (
                <span className="enc-asignado">
                  <span className="enc-avatar" aria-hidden>{iniciales(t.asignado_a)}</span>
                  {t.asignado_a}
                </span>
              ) : (
                <span className="suave">Sin asignar</span>
              )}
            </dd>
          </div>
          <div className="enc-dato">
            <dt>Primera respuesta</dt>
            <dd className="enc-sla">
              <PildoraSla semaforo={resp.semaforo} />
              <span className="enc-sub mono">
                {resp.pendiente && resp.semaforo !== "pausado" ? "pendiente" : duracion(resp.ms)} · meta {objetivo.respuesta} h
              </span>
            </dd>
          </div>
          <div className="enc-dato">
            <dt>Resolución</dt>
            <dd className="enc-sla">
              <PildoraSla semaforo={reso.semaforo} />
              <span className="enc-sub mono">
                {reso.pendiente || reso.semaforo === "na" ? "pendiente" : duracion(reso.ms)} · meta {objetivo.resolucion} h
              </span>
            </dd>
          </div>
          <div className="enc-dato">
            <dt>{t.resuelto_at ? "Tiempo total" : "Tiempo abierto"}</dt>
            <dd>{duracion(tiempoAbierto)}<span className="enc-sub mono">desde {fechaHora(t.created_at)}</span></dd>
          </div>
        </dl>
      </section>

      <div className="detalle-grid">
        {/* Columna principal: descripción + conversación */}
        <div className="detalle-principal">
          <section className="tarjeta-detalle">
            <h2 className="seccion-titulo">Descripción</h2>
            <p className={t.descripcion ? "" : "suave"}>
              {t.descripcion || "Sin descripción."}
            </p>
            {t.equipos?.nombre && (
              <p className="suave mono" style={{ marginTop: 10 }}>Equipo relacionado: {t.equipos.nombre}</p>
            )}
            {fotos.length > 0 && (
              <>
                <h3 className="aside-titulo" style={{ marginTop: 16 }}>Fotos del solicitante</h3>
                <ul className="galeria-adjuntos">
                  {fotos.map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noreferrer" title={f.nombre}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.nombre} loading="lazy" />
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="tarjeta-detalle">
            <div className="conv-cab">
              <h2 className="seccion-titulo" style={{ margin: 0 }}>Conversación y actividad</h2>
              <span className="conv-conteo">{respondidos} {respondidos === 1 ? "respuesta enviada" : "respuestas enviadas"}</span>
            </div>

            {/* Un solo cuadro de texto, dos destinos: nota interna o respuesta al cliente. */}
            <form className="responder">
              <input type="hidden" name="id" value={t.id} />
              <textarea
                name="cuerpo"
                required
                rows={3}
                placeholder="Escribe una actualización: una nota interna para el equipo o una respuesta para el solicitante…"
              />
              <div className="responder-pie">
                <div className="responder-info">
                  <span className="responder-hint">
                    La <strong>nota interna</strong> solo la ve TI. La <strong>respuesta</strong> aparece en el portal del solicitante.
                  </span>
                  {puedeNotificar ? (
                    <label className="responder-correo">
                      <input type="checkbox" name="notificar" defaultChecked={defResp} />
                      También enviar por correo a <strong>{emailDestino}</strong>
                    </label>
                  ) : emailDestino ? (
                    <span className="correo-aviso">Correo apagado · <Link href="/ti/correo">configurar</Link></span>
                  ) : (
                    <span className="correo-aviso">El solicitante no tiene correo registrado.</span>
                  )}
                </div>
                <div className="responder-acciones">
                  <BotonEnviar className="boton secundario" formAction={agregarComentario} ocupado="Guardando…">Nota interna</BotonEnviar>
                  <BotonEnviar className="boton" formAction={responderCliente} ocupado="Enviando…">Responder al cliente</BotonEnviar>
                </div>
              </div>
            </form>

            {eventos.length === 0 ? (
              <div className="vacio" style={{ marginTop: 18 }}>Sin movimientos todavía.</div>
            ) : (
              <ol className="bitacora">
                {eventos.map((e: any) => {
                  const m = META_EVENTO[e.tipo] ?? META_EVENTO.sistema;
                  return (
                    <li key={e.id} className={`bitacora-item tipo-${e.tipo}`}>
                      <span className="bitacora-icono" aria-hidden>{m.icono}</span>
                      <div className="bitacora-cuerpo">
                        <div className="bitacora-meta">
                          <strong>{e.autor ?? "TI"}</strong>
                          {e.tipo === "respuesta" && <span className="bitacora-tag enviado">Visible para el cliente</span>}
                          {e.tipo === "mensaje_cliente" && <span className="bitacora-tag cliente">Del solicitante</span>}
                          {e.tipo === "comentario" && <span className="bitacora-tag interno">Interno</span>}
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
                  );
                })}
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
                {((ESTADOS_SELECCIONABLES as string[]).includes(t.estado) ? ESTADOS_SELECCIONABLES : [t.estado, ...ESTADOS_SELECCIONABLES]).map((valor) => {
                  const meta = ESTADOS_TICKET.find((s) => s.valor === valor);
                  return <option key={valor} value={valor}>{meta?.etiqueta ?? valor}</option>;
                })}
              </select>
              <textarea name="nota" placeholder="Nota del cambio (opcional)" rows={2} />
              {puedeNotificar ? (
                <label className="responder-correo">
                  <input type="checkbox" name="notificar" defaultChecked={defEstado} />
                  Notificar al solicitante por correo
                </label>
              ) : emailDestino ? (
                <span className="correo-aviso">Correo apagado · <Link href="/ti/correo">configurar</Link></span>
              ) : null}
              <BotonEnviar className="boton" ocupado="Guardando…">Guardar estado</BotonEnviar>
            </form>
          </section>

          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Asignación</h3>
            <form action={asignarTicket} className="bloque-form">
              <input type="hidden" name="id" value={t.id} />
              <input name="asignado_a" defaultValue={t.asignado_a ?? ""} placeholder="Técnico responsable" />
              <BotonEnviar className="boton secundario" ocupado="Asignando…">Asignar</BotonEnviar>
            </form>
          </section>

          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Detalles</h3>
            <dl className="datos-lista">
              <dt>Estado</dt><dd>{meta.etiqueta}</dd>
              <dt>Prioridad</dt><dd>{t.prioridad}</dd>
              <dt>Categoría</dt><dd>{t.categoria}</dd>
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
                <BotonEnviar className="boton" ocupado="Guardando…">Guardar cambios</BotonEnviar>
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
                <BotonEnviar className="boton secundario" style={{ color: "var(--critico)" }} ocupado="Eliminando…">
                  Eliminar definitivamente
                </BotonEnviar>
              </form>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
