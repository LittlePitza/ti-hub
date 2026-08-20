import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { dateTime, ticketFolio, duration } from "@/lib/utils/format";
import {
  TICKET_STATUSES,
  SELECTABLE_STATUSES,
  PRIORITIES,
  TICKET_CATEGORIES,
  statusMeta,
  evaluateResponse,
  evaluateResolution,
} from "@/lib/domain/tickets";
import { isValidEmail } from "@/lib/domain/portal";
import type { Attachment } from "@/lib/utils/attachments";
import { getEmailConfig, isEmailReady, resolveSla } from "@/lib/domain/email";
import Badge from "@/components/ui/Badge";
import SlaPill from "@/components/ui/SlaPill";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import { jsonbList } from "@/lib/utils/jsonb";
import {
  editTicket,
  changeTicketStatus,
  assignTicket,
  addComment,
  replyToRequester,
  deleteTicket,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

// Every activity-log event carries an icon, a label and a tone. `respuesta` is
// the only one visible to the requester; everything else is internal.
const META_EVENTO: Record<string, { icono: string; label: string }> = {
  respuesta: { icono: "↩", label: "Respuesta al solicitante" },
  mensaje_cliente: { icono: "📨", label: "Mensaje del solicitante" },
  comentario: { icono: "💬", label: "Nota interna" },
  estado: { icono: "⇄", label: "Cambio de estado" },
  asignacion: { icono: "👤", label: "Asignación" },
  sistema: { icono: "•", label: "Sistema" },
};

const initials = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export default async function DetalleTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getSupabase();
  if (!sb) {
    return (
      <>
        <div className="pagina-head">
          <div>
            <h1 className="pagina-titulo">Ticket</h1>
          </div>
        </div>
        <NoConnection />
      </>
    );
  }

  // Ticket, activity log and configuration do not depend on each other: a single
  // round-trip to the database.
  const [{ data: t }, { data: eventosData }, config] = await Promise.all([
    sb.from("tickets").select("*, equipos(nombre)").eq("id", id).maybeSingle(),
    sb
      .from("ticket_eventos")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: false }),
    getEmailConfig(sb),
  ]);
  if (!t) notFound();
  const eventos = eventosData ?? [];

  // Photos the requester attached when reporting: private bucket, signed URLs.
  const adjuntos = jsonbList<Attachment>(t.adjuntos);
  const fotos = (
    await Promise.all(
      adjuntos.map(async (a) => {
        const { data } = await sb.storage.from("tickets").createSignedUrl(a.path, 3600);
        return data?.signedUrl ? { url: data.signedUrl, nombre: a.nombre } : null;
      }),
    )
  ).filter((f): f is { url: string; nombre: string } => f !== null);

  const ahora = Date.now();
  const { sla, porVencerPct } = resolveSla(config);
  const resp = evaluateResponse(t, ahora, sla, porVencerPct);
  const reso = evaluateResolution(t, ahora, sla, porVencerPct);
  const objetivo = sla[t.prioridad as keyof typeof sla] ?? sla.media;
  const finRef = t.resuelto_at ? new Date(t.resuelto_at).getTime() : ahora;
  const tiempoAbierto = finRef - new Date(t.created_at).getTime();
  const meta = statusMeta(t.estado);
  const respondidos = eventos.filter((e: any) => e.tipo === "respuesta").length;

  // Email notification: optional (a checkbox) and only possible when the service
  // is operational and the requester has an email. The pre-check comes from the
  // panel configuration.
  const operativo = isEmailReady(config);
  const emailDestino = isValidEmail(t.solicitante_email ?? "")
    ? (t.solicitante_email as string)
    : null;
  const puedeNotificar = Boolean(operativo && emailDestino);
  const defResp = config?.notif_respuesta_def ?? true;
  const defEstado = config?.notif_estado_def ?? false;

  return (
    <>
      {/* Tarjeta de encabezado: toda la información del ticket de un vistazo */}
      <section className="ticket-encabezado detalle-head">
        <Link href="/ti/tickets" className="boton-texto">
          ← Tickets
        </Link>
        <div className="ticket-enc-top">
          <div className="ticket-enc-id">
            <span className="ticket-enc-folio mono">{ticketFolio(t.num)}</span>
            <h1 className="ticket-enc-titulo">{t.titulo}</h1>
          </div>
          <div className="detalle-badges">
            <Badge value={t.estado} />
            <Badge value={t.prioridad} isPriority />
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
                  <span className="enc-avatar" aria-hidden>
                    {initials(t.asignado_a)}
                  </span>
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
              <SlaPill slaStatus={resp.slaStatus} />
              <span className="enc-sub mono">
                {resp.pending && resp.slaStatus !== "pausado" ? "pendiente" : duration(resp.ms)} ·
                meta {objetivo.respuesta} h
              </span>
            </dd>
          </div>
          <div className="enc-dato">
            <dt>Resolución</dt>
            <dd className="enc-sla">
              <SlaPill slaStatus={reso.slaStatus} />
              <span className="enc-sub mono">
                {reso.pending || reso.slaStatus === "na" ? "pendiente" : duration(reso.ms)} · meta{" "}
                {objetivo.resolucion} h
              </span>
            </dd>
          </div>
          <div className="enc-dato">
            <dt>{t.resuelto_at ? "Tiempo total" : "Tiempo abierto"}</dt>
            <dd>
              {duration(tiempoAbierto)}
              <span className="enc-sub mono">desde {dateTime(t.created_at)}</span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="detalle-grid">
        {/* Columna principal: descripción + conversación */}
        <div className="detalle-principal">
          <section className="tarjeta-detalle">
            <h2 className="seccion-titulo">Descripción</h2>
            <p className={t.descripcion ? "" : "suave"}>{t.descripcion || "Sin descripción."}</p>
            {t.equipos?.nombre && (
              <p className="suave mono" style={{ marginTop: 10 }}>
                Equipo relacionado: {t.equipos.nombre}
              </p>
            )}
            {fotos.length > 0 && (
              <>
                <h3 className="aside-titulo" style={{ marginTop: 16 }}>
                  Fotos del solicitante
                </h3>
                <ul className="galeria-adjuntos">
                  {fotos.map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noreferrer" title={f.nombre}>
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
              <h2 className="seccion-titulo" style={{ margin: 0 }}>
                Conversación y actividad
              </h2>
              <span className="conv-conteo">
                {respondidos} {respondidos === 1 ? "respuesta enviada" : "respuestas enviadas"}
              </span>
            </div>

            {/* Un solo cuadro de text, dos destinos: nota interna o respuesta al cliente. */}
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
                    La <strong>nota interna</strong> solo la ve TI. La <strong>respuesta</strong>{" "}
                    aparece en el portal del solicitante.
                  </span>
                  {puedeNotificar ? (
                    <label className="responder-correo">
                      <input type="checkbox" name="notificar" defaultChecked={defResp} />
                      También enviar por correo a <strong>{emailDestino}</strong>
                    </label>
                  ) : emailDestino ? (
                    <span className="correo-aviso">
                      Correo apagado · <Link href="/ti/correo">configurar</Link>
                    </span>
                  ) : (
                    <span className="correo-aviso">El solicitante no tiene correo registrado.</span>
                  )}
                </div>
                <div className="responder-acciones">
                  <SubmitButton
                    className="boton secundario"
                    formAction={addComment}
                    ocupado="Guardando…"
                  >
                    Nota interna
                  </SubmitButton>
                  <SubmitButton className="boton" formAction={replyToRequester} ocupado="Enviando…">
                    Responder al cliente
                  </SubmitButton>
                </div>
              </div>
            </form>

            {eventos.length === 0 ? (
              <div className="vacio" style={{ marginTop: 18 }}>
                Sin movimientos todavía.
              </div>
            ) : (
              <ol className="bitacora">
                {eventos.map((e: any) => {
                  const m = META_EVENTO[e.tipo] ?? META_EVENTO.sistema;
                  return (
                    <li key={e.id} className={`bitacora-item tipo-${e.tipo}`}>
                      <span className="bitacora-icono" aria-hidden>
                        {m.icono}
                      </span>
                      <div className="bitacora-cuerpo">
                        <div className="bitacora-meta">
                          <strong>{e.autor ?? "TI"}</strong>
                          {e.tipo === "respuesta" && (
                            <span className="bitacora-tag enviado">Visible para el cliente</span>
                          )}
                          {e.tipo === "mensaje_cliente" && (
                            <span className="bitacora-tag cliente">Del solicitante</span>
                          )}
                          {e.tipo === "comentario" && (
                            <span className="bitacora-tag interno">Interno</span>
                          )}
                          <span className="suave mono">{dateTime(e.created_at)}</span>
                        </div>
                        {e.tipo === "estado" && (
                          <div className="bitacora-texto">
                            Cambió el estado: <Badge value={e.estado_anterior} /> →{" "}
                            <Badge value={e.estado_nuevo} />
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
            <form action={changeTicketStatus} className="bloque-form">
              <input type="hidden" name="id" value={t.id} />
              <select name="estado" defaultValue={t.estado}>
                {((SELECTABLE_STATUSES as string[]).includes(t.estado)
                  ? SELECTABLE_STATUSES
                  : [t.estado, ...SELECTABLE_STATUSES]
                ).map((value) => {
                  const meta = TICKET_STATUSES.find((s) => s.value === value);
                  return (
                    <option key={value} value={value}>
                      {meta?.label ?? value}
                    </option>
                  );
                })}
              </select>
              <textarea name="nota" placeholder="Nota del cambio (opcional)" rows={2} />
              {puedeNotificar ? (
                <label className="responder-correo">
                  <input type="checkbox" name="notificar" defaultChecked={defEstado} />
                  Notificar al solicitante por correo
                </label>
              ) : emailDestino ? (
                <span className="correo-aviso">
                  Correo apagado · <Link href="/ti/correo">configurar</Link>
                </span>
              ) : null}
              <SubmitButton className="boton" ocupado="Guardando…">
                Guardar estado
              </SubmitButton>
            </form>
          </section>

          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Asignación</h3>
            <form action={assignTicket} className="bloque-form">
              <input type="hidden" name="id" value={t.id} />
              <input
                name="asignado_a"
                defaultValue={t.asignado_a ?? ""}
                placeholder="Técnico responsable"
              />
              <SubmitButton className="boton secundario" ocupado="Asignando…">
                Asignar
              </SubmitButton>
            </form>
          </section>

          <section className="tarjeta-detalle">
            <h3 className="aside-titulo">Detalles</h3>
            <dl className="datos-lista">
              <dt>Estado</dt>
              <dd>{meta.label}</dd>
              <dt>Prioridad</dt>
              <dd>{t.prioridad}</dd>
              <dt>Categoría</dt>
              <dd>{t.categoria}</dd>
              <dt>Actualizado</dt>
              <dd className="mono">{dateTime(t.updated_at)}</dd>
            </dl>

            <details className="plegable interno">
              <summary>Editar ticket</summary>
              <form action={editTicket} className="bloque-form" style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={t.id} />
                <label className="mini-label">Asunto</label>
                <input name="titulo" defaultValue={t.titulo} required />
                <label className="mini-label">Solicitante</label>
                <input name="solicitante" defaultValue={t.solicitante} required />
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Categoría</label>
                    <select name="categoria" defaultValue={t.categoria}>
                      {TICKET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">Prioridad</label>
                    <select name="prioridad" defaultValue={t.prioridad}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="mini-label">Asignado a</label>
                <input name="asignado_a" defaultValue={t.asignado_a ?? ""} />
                <label className="mini-label">Descripción</label>
                <textarea name="descripcion" defaultValue={t.descripcion ?? ""} rows={4} />
                <SubmitButton className="boton" ocupado="Guardando…">
                  Guardar cambios
                </SubmitButton>
              </form>
            </details>

            <details className="plegable interno zona-peligro">
              <summary>Eliminar ticket</summary>
              <form action={deleteTicket} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="desde" value="detalle" />
                <p className="suave" style={{ fontSize: 12.5, marginBottom: 8 }}>
                  Esta acción es permanente y borra también su bitácora.
                </p>
                <SubmitButton
                  className="boton secundario"
                  style={{ color: "var(--critico)" }}
                  ocupado="Eliminando…"
                >
                  Eliminar definitivamente
                </SubmitButton>
              </form>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
