import { headers } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import { getConfigCorreo, correoOperativo, tieneCredenciales } from "@/lib/correo";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import {
  guardarConfigCorreo,
  enviarPruebaCorreo,
  conectarMicrosoft,
  desconectarMicrosoft,
} from "./actions";

export const dynamic = "force-dynamic";

const AVISOS_PRUEBA: Record<string, { tono: string; texto: string }> = {
  ok: { tono: "ok", texto: "Correo de prueba enviado. Revisa la bandeja (y el spam)." },
  error: { tono: "critico", texto: "No se pudo enviar. Revisa el método de envío y las credenciales." },
  sincreds: { tono: "aviso", texto: "Faltan credenciales para el método elegido. Guárdalas antes de probar." },
  falta: { tono: "aviso", texto: "Escribe un correo de destino para la prueba." },
  conectado: { tono: "ok", texto: "Cuenta de Microsoft conectada. Ya puedes enviar correos." },
  desconectado: { tono: "aviso", texto: "Se desconectó la cuenta de Microsoft." },
  oautherror: { tono: "critico", texto: "No se pudo conectar con Microsoft. Revisa los datos de Azure e inténtalo de nuevo." },
  oauthfalta: { tono: "aviso", texto: "Primero guarda el Tenant, Client ID y secreto de Azure; luego conecta." },
};

// Traduce el error crudo de Microsoft 365 a una causa concreta y su solución.
function pistaError(detalle: string): string | null {
  const d = detalle.toLowerCase();
  if (d.includes("disabled for the mailbox"))
    return "SMTP AUTH sigue apagado en este buzón. Si acabas de activarlo, espera unos minutos a que propague y vuelve a probar.";
  if (d.includes("disabled for the tenant"))
    return "SMTP AUTH está bloqueado a nivel de toda la organización. Habilítalo con: Set-TransportConfig -SmtpClientAuthenticationDisabled $false";
  if (d.includes("credentials") || d.includes("authentication unsuccessful") || d.includes("invalid login"))
    return "Usuario o contraseña no válidos. Si la cuenta tiene MFA, su contraseña normal no funciona: usa un método OAuth o una contraseña de aplicación.";
  if (d.includes("invalid_client") || d.includes("aadsts7000215"))
    return "El secreto de cliente (client secret) es incorrecto o expiró. Genera uno nuevo en Azure y guárdalo aquí.";
  if (d.includes("aadsts700016") || d.includes("application with identifier"))
    return "El Client ID o el Tenant no coinciden con la app registrada en Azure. Verifícalos.";
  if (d.includes("aadsts65001") || d.includes("consent"))
    return "Falta el consentimiento del administrador para el permiso Mail.Send en Azure.";
  if (d.includes("erroraccessdenied") || d.includes("accessdenied"))
    return "La app no tiene permiso para mandar como ese buzón. Revisa Mail.Send y la política de acceso (ApplicationAccessPolicy).";
  if (d.includes("etimedout") || d.includes("econnection") || d.includes("econnrefused"))
    return "No se alcanzó el servidor SMTP. Verifica el host y el puerto (587 para Microsoft 365).";
  return null;
}

const ETIQUETA_METODO: Record<string, string> = {
  graph_app: "App (Graph)",
  oauth_interactivo: "Microsoft",
  smtp_basico: "SMTP",
};

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
        <p className="pagina-desc">Notificaciones al solicitante y avisos internos: método de envío, plantillas y preferencias</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const c = await getConfigCorreo(sb);
  const operativo = correoOperativo(c);
  const conCreds = tieneCredenciales(c);
  const metodo = c?.metodo ?? "smtp_basico";
  const avisoPrueba = prueba ? AVISOS_PRUEBA[prueba] : null;
  const pista = (prueba === "error" || prueba === "oautherror") && detalle ? pistaError(detalle) : null;

  // URL de redirección que hay que registrar en Azure para el login interactivo.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectUri = `${proto}://${host}/ti/correo/callback`;
  const conectado = Boolean(c?.oauth_refresh_token);

  // Chips de estado en los encabezados plegables (la estructura comunica el estado).
  const numDestinos = (c?.notif_nuevo_destinos ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)).length;
  const avisoNuevoOn = (c?.notif_nuevo ?? true) && numDestinos > 0;
  const remitente = c?.remitente || c?.oauth_cuenta || c?.smtp_user || "";

  // Estado del servicio: encendido y con credenciales / apagado / incompleto.
  const estado = operativo
    ? { tono: "ok", titulo: "Activo", desc: "Las notificaciones se pueden enviar desde cada ticket." }
    : conCreds
      ? { tono: "aviso", titulo: "Apagado", desc: "Hay credenciales, pero el interruptor está apagado: no se enviará nada." }
      : { tono: "critico", titulo: "Sin configurar", desc: "Falta completar las credenciales del método elegido." };

  return (
    <div className="correo-wrap">
      {head}

      {guardado && <div className="banner-config ok" role="status">Cambios guardados.</div>}
      {avisoPrueba && (
        <div className={`banner-config ${avisoPrueba.tono}`} role="status">
          <div>{avisoPrueba.texto}</div>
          {pista && <div className="banner-config-pista">{pista}</div>}
          {detalle && (prueba === "error" || prueba === "oautherror") && (
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

      {/* Prueba arriba: lo que más se usa, a un clic y sin scroll. */}
      <form className="config-prueba destacada" action={enviarPruebaCorreo}>
        <h2>Enviar correo de prueba</h2>
        <div className="config-prueba-fila">
          <input name="para" type="email" required placeholder="tu.correo@plasticospimsa.com" aria-label="Correo de destino" />
          <BotonEnviar className="boton" ocupado="Enviando…">Enviar prueba</BotonEnviar>
        </div>
        <p className="config-ayuda" style={{ marginBottom: 0, marginTop: 10 }}>
          Usa el método y las credenciales guardadas. Si acabas de cambiar algo, guarda primero abajo.
        </p>
      </form>

      <form className="formulario config-form" action={guardarConfigCorreo}>
        {/* ---------- Método y conexión ---------- */}
        <details className="config-fold" open={!conCreds}>
          <summary>
            Método y conexión
            <span className="fold-chip">{ETIQUETA_METODO[metodo] ?? metodo}</span>
          </summary>
          <div className="config-fold-cuerpo">
            <p className="config-ayuda">
              Microsoft retira la contraseña por SMTP a fin de 2026. Los métodos OAuth no guardan
              contraseña y son a prueba de futuro. Elige uno; abajo aparecen solo sus campos.
            </p>
            <div className="metodo-opciones">
              <label className="metodo-opcion">
                <input type="radio" id="m-graph" name="metodo" value="graph_app" defaultChecked={metodo === "graph_app"} />
                <span className="metodo-cuerpo">
                  <span className="metodo-titulo">Conexión de app (Graph) <span className="metodo-tag">recomendado</span></span>
                  <span className="metodo-detalle">Sin contraseña, no caduca. Manda como un buzón fijo. Requiere registrar una app en Azure.</span>
                </span>
              </label>
              <label className="metodo-opcion">
                <input type="radio" id="m-oauth" name="metodo" value="oauth_interactivo" defaultChecked={metodo === "oauth_interactivo"} />
                <span className="metodo-cuerpo">
                  <span className="metodo-titulo">Iniciar sesión con Microsoft</span>
                  <span className="metodo-detalle">Te lleva a la página de Microsoft, inicias sesión y manda como esa cuenta.</span>
                </span>
              </label>
              <label className="metodo-opcion">
                <input type="radio" id="m-smtp" name="metodo" value="smtp_basico" defaultChecked={metodo === "smtp_basico"} />
                <span className="metodo-cuerpo">
                  <span className="metodo-titulo">SMTP básico <span className="metodo-tag legado">legado</span></span>
                  <span className="metodo-detalle">Usuario y contraseña. Funciona hasta diciembre 2026.</span>
                </span>
              </label>
            </div>

            {/* SMTP básico */}
            <div className="metodo-bloque bloque-smtp">
              <h3 className="config-sub">Servidor SMTP</h3>
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
                  <input id="smtp_user" name="smtp_user" type="email" defaultValue={c?.smtp_user ?? ""} placeholder="soporteti@plasticospimsa.com" />
                </div>
                <div className="campo">
                  <label htmlFor="smtp_pass">Contraseña</label>
                  <input id="smtp_pass" name="smtp_pass" type="password" placeholder={c?.smtp_pass ? "•••••••• (sin cambios)" : "Contraseña o app password"} autoComplete="new-password" />
                </div>
              </div>
            </div>

            {/* Datos de Azure (compartidos por Graph y login interactivo) */}
            <div className="metodo-bloque bloque-azure">
              <h3 className="config-sub">Microsoft Entra ID (Azure)</h3>
              <p className="config-ayuda">
                En <strong>portal.azure.com → Microsoft Entra ID → Registros de aplicaciones → Nuevo registro</strong>,
                registra una app y copia aquí el <strong>Directorio (tenant) ID</strong> y el <strong>Id. de aplicación (cliente)</strong>.
                En <strong>Certificados y secretos</strong> genera un <strong>secreto de cliente</strong>.
              </p>
              <ul className="config-pasos">
                <li><strong>App-only (Graph):</strong> en Permisos de API agrega <code>Microsoft Graph → Aplicación → Mail.Send</code> y da <strong>consentimiento de administrador</strong>. Limita el envío al buzón con una <code>ApplicationAccessPolicy</code>.</li>
                <li><strong>Login interactivo:</strong> agrega <code>Microsoft Graph → Delegado → Mail.Send</code> y registra esta URL de redirección (tipo Web):</li>
              </ul>
              <code className="config-redirect">{redirectUri}</code>
              <div className="campos">
                <div className="campo ancho">
                  <label htmlFor="azure_tenant_id">Directorio (tenant) ID</label>
                  <input id="azure_tenant_id" name="azure_tenant_id" defaultValue={c?.azure_tenant_id ?? ""} placeholder="00000000-0000-0000-0000-000000000000" />
                </div>
                <div className="campo">
                  <label htmlFor="azure_client_id">Id. de aplicación (cliente)</label>
                  <input id="azure_client_id" name="azure_client_id" defaultValue={c?.azure_client_id ?? ""} placeholder="00000000-0000-0000-0000-000000000000" />
                </div>
                <div className="campo">
                  <label htmlFor="azure_client_secret">Secreto de cliente</label>
                  <input id="azure_client_secret" name="azure_client_secret" type="password" placeholder={c?.azure_client_secret ? "•••••••• (sin cambios)" : "Valor del secreto"} autoComplete="new-password" />
                </div>
              </div>
            </div>
          </div>
        </details>

        {/* ---------- Avisos de ticket nuevo (a TI) ---------- */}
        <details className="config-fold">
          <summary>
            Avisos de ticket nuevo
            <span className={`fold-chip ${avisoNuevoOn ? "ok" : "aviso"}`}>
              {avisoNuevoOn ? `${numDestinos} destinatario${numDestinos === 1 ? "" : "s"}` : "apagado"}
            </span>
          </summary>
          <div className="config-fold-cuerpo">
            <p className="config-ayuda">
              Cuando un empleado levanta un reporte en el portal, TI recibe un correo con el resumen y un
              botón para abrir el ticket. El envío usa el método configurado arriba (necesita el servicio activo).
            </p>
            <label className="config-switch">
              <input type="checkbox" name="notif_nuevo" defaultChecked={c?.notif_nuevo ?? true} />
              <span><strong>Avisar por correo al entrar un ticket nuevo.</strong></span>
            </label>
            <div className="campo ancho">
              <label htmlFor="notif_nuevo_destinos">¿A quién le llegan?</label>
              <textarea
                id="notif_nuevo_destinos"
                name="notif_nuevo_destinos"
                rows={2}
                defaultValue={c?.notif_nuevo_destinos ?? ""}
                placeholder="sistemas@plasticospimsa.com, soporte@plasticospimsa.com"
              />
              <span className="campo-pista">Uno o varios correos, separados por coma o salto de línea.</span>
            </div>
            <div className="campo">
              <label htmlFor="asunto_nuevo">Asunto</label>
              <input id="asunto_nuevo" name="asunto_nuevo" defaultValue={c?.asunto_nuevo ?? ""} />
            </div>
            <div className="campo">
              <label htmlFor="cuerpo_nuevo">Cuerpo</label>
              <textarea id="cuerpo_nuevo" name="cuerpo_nuevo" rows={6} defaultValue={c?.cuerpo_nuevo ?? ""} />
            </div>
            <p className="config-ayuda" style={{ marginBottom: 0 }}>
              Variables: <code>{"{{folio}}"}</code> <code>{"{{titulo}}"}</code> <code>{"{{solicitante}}"}</code>
              <code>{"{{categoria}}"}</code> <code>{"{{descripcion}}"}</code>. El botón al ticket se agrega solo.
            </p>
          </div>
        </details>

        {/* ---------- Remitente y enlace ---------- */}
        <details className="config-fold">
          <summary>
            Remitente y enlace
            <span className={`fold-chip ${remitente ? "" : "aviso"}`}>{remitente || "sin definir"}</span>
          </summary>
          <div className="config-fold-cuerpo">
            <div className="campos">
              <div className="campo">
                <label htmlFor="remitente">Buzón remitente (De:)</label>
                <input id="remitente" name="remitente" type="email" defaultValue={c?.remitente ?? ""} placeholder="soporteti@plasticospimsa.com" />
              </div>
              <div className="campo">
                <label htmlFor="remitente_nombre">Nombre mostrado</label>
                <input id="remitente_nombre" name="remitente_nombre" defaultValue={c?.remitente_nombre ?? "Soporte TI · Plásticos PIMSA"} />
              </div>
              <div className="campo ancho">
                <label htmlFor="sitio_url">URL del portal (botones del correo)</label>
                <input id="sitio_url" name="sitio_url" type="url" defaultValue={c?.sitio_url ?? ""} placeholder="https://ti-hub.vercel.app/" />
              </div>
            </div>
            <p className="config-ayuda" style={{ marginBottom: 0 }}>
              En el login interactivo se manda como la cuenta conectada; en los demás métodos, desde este buzón.
              La URL del portal arma el botón que abre el ticket o los reportes.
            </p>
          </div>
        </details>

        {/* ---------- Plantillas al solicitante ---------- */}
        <details className="config-fold">
          <summary>Plantillas al solicitante</summary>
          <div className="config-fold-cuerpo">
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
          </div>
        </details>

        {/* ---------- Servicio y preferencias ---------- */}
        <details className="config-fold">
          <summary>
            Servicio y preferencias
            <span className={`fold-chip ${c?.activo ? "ok" : "aviso"}`}>{c?.activo ? "encendido" : "apagado"}</span>
          </summary>
          <div className="config-fold-cuerpo">
            <label className="config-switch">
              <input type="checkbox" name="activo" defaultChecked={c?.activo ?? false} />
              <span><strong>Activar el envío de correos.</strong> Si está apagado, nunca se envía nada (ni avisos ni notificaciones).</span>
            </label>
            <label className="config-switch">
              <input type="checkbox" name="notif_respuesta_def" defaultChecked={c?.notif_respuesta_def ?? true} />
              <span>Al responder a un cliente, <strong>precargar</strong> la casilla "enviar por correo".</span>
            </label>
            <label className="config-switch">
              <input type="checkbox" name="notif_estado_def" defaultChecked={c?.notif_estado_def ?? false} />
              <span>Al cambiar el estado, <strong>precargar</strong> la casilla "notificar por correo".</span>
            </label>
          </div>
        </details>

        <BotonEnviar className="boton" ocupado="Guardando…">Guardar configuración</BotonEnviar>
      </form>

      {/* Conexión interactiva con Microsoft (fuera del form de guardar: otra acción) */}
      <section className="config-seccion metodo-bloque bloque-oauth seccion-oauth">
        <h2>Conexión con Microsoft</h2>
        {conectado ? (
          <>
            <div className="oauth-estado conectado">
              <span className="oauth-punto" aria-hidden />
              <div>
                <strong>Conectado</strong>
                <span className="oauth-cuenta">{c?.oauth_cuenta || "cuenta de Microsoft"}</span>
              </div>
            </div>
            <div className="oauth-acciones">
              <form action={conectarMicrosoft}>
                <BotonEnviar className="boton secundario" ocupado="Conectando…">Reconectar</BotonEnviar>
              </form>
              <form action={desconectarMicrosoft}>
                <BotonEnviar className="boton secundario" style={{ color: "var(--critico)" }} ocupado="…">Desconectar</BotonEnviar>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="config-ayuda">
              Guarda primero el Tenant, Client ID y secreto de arriba. Luego conéctate: se abrirá la
              página de Microsoft para iniciar sesión y autorizar el envío de correo.
            </p>
            <form action={conectarMicrosoft}>
              <BotonEnviar className="boton" ocupado="Conectando…">Conectar con Microsoft</BotonEnviar>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
