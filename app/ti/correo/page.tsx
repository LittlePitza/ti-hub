import { getSupabase } from "@/lib/supabase";
import { getConfigCorreo, correoOperativo, tieneCredenciales } from "@/lib/correo";
import SinConexion from "@/components/SinConexion";
import { guardarConfigCorreo, enviarPruebaCorreo } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS_PRUEBA: Record<string, { tono: string; texto: string }> = {
  ok: { tono: "ok", texto: "Correo de prueba enviado. Revisa la bandeja (y el spam)." },
  error: { tono: "critico", texto: "No se pudo enviar. Revisa usuario, contraseña y que el buzón tenga SMTP AUTH habilitado." },
  sincreds: { tono: "aviso", texto: "Faltan credenciales SMTP. Guárdalas antes de probar." },
  falta: { tono: "aviso", texto: "Escribe un correo de destino para la prueba." },
};

// Traduce el error crudo de Microsoft 365 a una causa concreta y su solución.
function pistaError(detalle: string): string | null {
  const d = detalle.toLowerCase();
  if (d.includes("disabled for the mailbox"))
    return "Microsoft dice que SMTP AUTH sigue apagado en este buzón. Si acabas de activarlo, espera unos minutos a que propague y vuelve a probar.";
  if (d.includes("disabled for the tenant"))
    return "SMTP AUTH está bloqueado a nivel de toda la organización. Habilítalo con: Set-TransportConfig -SmtpClientAuthenticationDisabled $false";
  if (d.includes("credentials") || d.includes("authentication unsuccessful") || d.includes("invalid login"))
    return "Usuario o contraseña no válidos. Si la cuenta tiene MFA, su contraseña normal no funciona: genera una contraseña de aplicación y guárdala aquí.";
  if (d.includes("tenant") && d.includes("basic"))
    return "La autenticación básica está bloqueada para este tenant. Usa una contraseña de aplicación o habilita SMTP AUTH.";
  if (d.includes("etimedout") || d.includes("econnection") || d.includes("econnrefused"))
    return "No se alcanzó el servidor SMTP. Verifica el host y el puerto (587 para Microsoft 365).";
  return null;
}

export default async function ConfigCorreo({
  searchParams,
}: {
  searchParams: Promise<{ guardado?: string; prueba?: string; detalle?: string }>;
}) {
  const { guardado, prueba, detalle } = await searchParams;
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Correo</h1>
        <p className="pagina-desc">Notificaciones al solicitante: servidor, plantillas y preferencias</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const c = await getConfigCorreo(sb);
  const operativo = correoOperativo(c);
  const conCreds = tieneCredenciales(c);
  const avisoPrueba = prueba ? AVISOS_PRUEBA[prueba] : null;
  const pista = prueba === "error" && detalle ? pistaError(detalle) : null;

  // Estado del servicio: encendido y con credenciales / apagado / incompleto.
  const estado = operativo
    ? { tono: "ok", titulo: "Activo", desc: "Las notificaciones se pueden enviar desde cada ticket." }
    : conCreds
      ? { tono: "aviso", titulo: "Apagado", desc: "Hay credenciales, pero el interruptor está apagado: no se enviará nada." }
      : { tono: "critico", titulo: "Sin configurar", desc: "Falta el usuario o la contraseña SMTP." };

  return (
    <>
      {head}

      {guardado && <div className="banner-config ok" role="status">Cambios guardados.</div>}
      {avisoPrueba && (
        <div className={`banner-config ${avisoPrueba.tono}`} role="status">
          <div>{avisoPrueba.texto}</div>
          {pista && <div className="banner-config-pista">{pista}</div>}
          {prueba === "error" && detalle && (
            <details className="banner-config-detalle">
              <summary>Ver respuesta de Microsoft</summary>
              <code>{detalle}</code>
            </details>
          )}
        </div>
      )}

      <div className={`estado-servicio ${estado.tono}`}>
        <span className="estado-punto" aria-hidden />
        <div>
          <div className="estado-titulo">Servicio de correo · {estado.titulo}</div>
          <div className="estado-desc">{estado.desc}</div>
        </div>
      </div>

      <form className="formulario config-form" action={guardarConfigCorreo}>
        <section className="config-seccion">
          <h2>Servidor SMTP</h2>
          <p className="config-ayuda">
            Microsoft 365: <code>smtp.office365.com</code>, puerto <code>587</code>. El buzón necesita
            <strong> SMTP AUTH habilitado</strong> y, si tiene MFA, una <strong>contraseña de aplicación</strong>.
          </p>
          <div className="campos">
            <div className="campo">
              <label htmlFor="smtp_host">Servidor</label>
              <input id="smtp_host" name="smtp_host" defaultValue={c?.smtp_host ?? "smtp.office365.com"} />
            </div>
            <div className="campo">
              <label htmlFor="smtp_port">Puerto</label>
              <input id="smtp_port" name="smtp_port" type="number" defaultValue={c?.smtp_port ?? 587} />
            </div>
            <div className="campo">
              <label htmlFor="smtp_user">Usuario (correo)</label>
              <input id="smtp_user" name="smtp_user" type="email" defaultValue={c?.smtp_user ?? ""} placeholder="soporte.ti@plasticospimsa.com" />
            </div>
            <div className="campo">
              <label htmlFor="smtp_pass">Contraseña</label>
              <input id="smtp_pass" name="smtp_pass" type="password" placeholder={c?.smtp_pass ? "•••••••• (sin cambios)" : "Contraseña o app password"} autoComplete="new-password" />
            </div>
            <div className="campo">
              <label htmlFor="remitente">Remitente (De:)</label>
              <input id="remitente" name="remitente" type="email" defaultValue={c?.remitente ?? ""} placeholder="Por defecto, el usuario" />
            </div>
            <div className="campo">
              <label htmlFor="remitente_nombre">Nombre mostrado</label>
              <input id="remitente_nombre" name="remitente_nombre" defaultValue={c?.remitente_nombre ?? "Soporte TI · Plásticos PIMSA"} />
            </div>
            <div className="campo ancho">
              <label htmlFor="sitio_url">URL del portal (botón del correo)</label>
              <input id="sitio_url" name="sitio_url" type="url" defaultValue={c?.sitio_url ?? ""} placeholder="https://soporte.plasticospimsa.com" />
            </div>
          </div>
        </section>

        <section className="config-seccion">
          <h2>Servicio y preferencias</h2>
          <label className="config-switch">
            <input type="checkbox" name="activo" defaultChecked={c?.activo ?? false} />
            <span><strong>Activar el envío de correos.</strong> Si está apagado, nunca se envía nada aunque marques la casilla en un ticket.</span>
          </label>
          <label className="config-switch">
            <input type="checkbox" name="notif_respuesta_def" defaultChecked={c?.notif_respuesta_def ?? true} />
            <span>Al responder a un cliente, <strong>precargar</strong> la casilla "enviar por correo".</span>
          </label>
          <label className="config-switch">
            <input type="checkbox" name="notif_estado_def" defaultChecked={c?.notif_estado_def ?? false} />
            <span>Al cambiar el estado, <strong>precargar</strong> la casilla "notificar por correo".</span>
          </label>
        </section>

        <section className="config-seccion">
          <h2>Plantillas</h2>
          <p className="config-ayuda">
            Variables disponibles (se reemplazan al enviar):
            <code>{"{{folio}}"}</code> <code>{"{{titulo}}"}</code> <code>{"{{nombre}}"}</code>
            <code>{"{{mensaje}}"}</code> (solo respuesta) <code>{"{{estado}}"}</code> (solo cambio de estado).
            El cuerpo es texto; se le aplica el diseño de marca PIMSA automáticamente.
          </p>

          <h3 className="config-sub">Respuesta al cliente</h3>
          <div className="campo">
            <label htmlFor="asunto_respuesta">Asunto</label>
            <input id="asunto_respuesta" name="asunto_respuesta" defaultValue={c?.asunto_respuesta ?? ""} />
          </div>
          <div className="campo">
            <label htmlFor="cuerpo_respuesta">Cuerpo</label>
            <textarea id="cuerpo_respuesta" name="cuerpo_respuesta" rows={6} defaultValue={c?.cuerpo_respuesta ?? ""} />
          </div>

          <h3 className="config-sub">Cambio de estado</h3>
          <div className="campo">
            <label htmlFor="asunto_estado">Asunto</label>
            <input id="asunto_estado" name="asunto_estado" defaultValue={c?.asunto_estado ?? ""} />
          </div>
          <div className="campo">
            <label htmlFor="cuerpo_estado">Cuerpo</label>
            <textarea id="cuerpo_estado" name="cuerpo_estado" rows={5} defaultValue={c?.cuerpo_estado ?? ""} />
          </div>
        </section>

        <button className="boton" type="submit">Guardar configuración</button>
      </form>

      <form className="formulario config-prueba" action={enviarPruebaCorreo}>
        <h2>Enviar correo de prueba</h2>
        <p className="config-ayuda">Usa las credenciales guardadas. Guarda primero si acabas de cambiarlas.</p>
        <div className="config-prueba-fila">
          <input name="para" type="email" required placeholder="tu.correo@plasticospimsa.com" aria-label="Correo de destino" />
          <button className="boton secundario" type="submit">Enviar prueba</button>
        </div>
      </form>
    </>
  );
}
