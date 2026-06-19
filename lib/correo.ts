import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { folio } from "./format";
import { type SlaTabla, SLA_DEFAULTS, SLA_POR_VENCER_PCT_DEFAULT } from "./tickets";

// Configuración de correo administrada desde el panel (/ti/correo), no por env.
// Vive en la fila única `config_correo` (id = 1). El envío lo decide TI por ticket
// (no es automático); aquí solo está el cómo enviar y con qué plantillas.
//
// Tres métodos de envío (Microsoft 365 retira la auth básica por SMTP a fin de 2026):
//  - smtp_basico: usuario/contraseña por SMTP (legado).
//  - graph_app: app-only (client credentials) vía Microsoft Graph. No caduca, manda
//    como un buzón fijo. Necesita permiso de aplicación Mail.Send con consentimiento.
//  - oauth_interactivo: "Iniciar sesión con Microsoft"; guarda un refresh token y
//    manda como la cuenta que se conectó. Permiso delegado Mail.Send.
export type MetodoCorreo = "smtp_basico" | "graph_app" | "oauth_interactivo";

export type ConfigCorreo = {
  activo: boolean;
  metodo: MetodoCorreo;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string | null;
  smtp_pass: string | null;
  azure_tenant_id: string | null;
  azure_client_id: string | null;
  azure_client_secret: string | null;
  oauth_refresh_token: string | null;
  oauth_cuenta: string | null;
  remitente: string | null;
  remitente_nombre: string;
  sitio_url: string | null;
  // Valores por defecto de la firma de correo de empleados (null = usar constante).
  firma_web: string | null;
  firma_direccion: string | null;
  firma_eslogan: string | null;
  notif_respuesta_def: boolean;
  notif_estado_def: boolean;
  notif_nuevo: boolean;
  notif_nuevo_destinos: string | null;
  asunto_respuesta: string;
  cuerpo_respuesta: string;
  asunto_estado: string;
  cuerpo_estado: string;
  asunto_nuevo: string;
  cuerpo_nuevo: string;
  // SLA configurable (horas de reloj). null = usar el predeterminado de lib/tickets.ts.
  sla_critica_respuesta: number | null;
  sla_critica_resolucion: number | null;
  sla_alta_respuesta: number | null;
  sla_alta_resolucion: number | null;
  sla_media_respuesta: number | null;
  sla_media_resolucion: number | null;
  sla_baja_respuesta: number | null;
  sla_baja_resolucion: number | null;
  sla_por_vencer_pct: number;
};

// Construye la tabla de SLA activa combinando los valores de config_correo con los
// predeterminados del código (NULL en BD = usar el valor del código).
export function resolverSla(config: ConfigCorreo | null): { sla: SlaTabla; porVencerPct: number } {
  const d = SLA_DEFAULTS;
  return {
    sla: {
      critica: {
        respuesta: config?.sla_critica_respuesta ?? d.critica.respuesta,
        resolucion: config?.sla_critica_resolucion ?? d.critica.resolucion,
      },
      alta: {
        respuesta: config?.sla_alta_respuesta ?? d.alta.respuesta,
        resolucion: config?.sla_alta_resolucion ?? d.alta.resolucion,
      },
      media: {
        respuesta: config?.sla_media_respuesta ?? d.media.respuesta,
        resolucion: config?.sla_media_resolucion ?? d.media.resolucion,
      },
      baja: {
        respuesta: config?.sla_baja_respuesta ?? d.baja.respuesta,
        resolucion: config?.sla_baja_resolucion ?? d.baja.resolucion,
      },
    },
    porVencerPct: config?.sla_por_vencer_pct ?? SLA_POR_VENCER_PCT_DEFAULT,
  };
}

export async function getConfigCorreo(sb: SupabaseClient): Promise<ConfigCorreo | null> {
  const { data } = await sb.from("config_correo").select("*").eq("id", 1).maybeSingle();
  return (data as ConfigCorreo) ?? null;
}

// El buzón desde el que se manda (remitente explícito o el usuario configurado).
function buzon(c: ConfigCorreo): string {
  return c.remitente || c.smtp_user || c.oauth_cuenta || "";
}

// Hay con qué enviar según el método (sirve para la prueba aunque el servicio esté apagado).
export function tieneCredenciales(c: ConfigCorreo | null): c is ConfigCorreo {
  if (!c) return false;
  if (c.metodo === "graph_app")
    return Boolean(c.azure_tenant_id && c.azure_client_id && c.azure_client_secret && buzon(c));
  if (c.metodo === "oauth_interactivo")
    return Boolean(c.azure_tenant_id && c.azure_client_id && c.azure_client_secret && c.oauth_refresh_token);
  return Boolean(c.smtp_user && c.smtp_pass && (c.remitente || c.smtp_user));
}
// Listo para notificar de verdad: credenciales + interruptor maestro encendido.
export function correoOperativo(c: ConfigCorreo | null): c is ConfigCorreo {
  return tieneCredenciales(c) && c.activo;
}

type Resultado = { ok: true } | { ok: false; motivo: "no_config" | "error"; detalle?: string };

// ---------- OAuth2 / Microsoft Entra ID ----------
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE_DELEGADO = "https://graph.microsoft.com/Mail.Send offline_access openid email";

function urlToken(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

// URL a la que mandamos al admin para que inicie sesión y consienta (flujo interactivo).
export function urlAutorizacion(c: ConfigCorreo, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: c.azure_client_id ?? "",
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPE_DELEGADO,
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${c.azure_tenant_id}/oauth2/v2.0/authorize?${p.toString()}`;
}

// Canjea el código del callback por tokens; devuelve el refresh token y la cuenta conectada.
export async function intercambiarCodigo(
  c: ConfigCorreo,
  code: string,
  redirectUri: string,
): Promise<{ refresh_token: string; cuenta: string }> {
  const res = await fetch(urlToken(c.azure_tenant_id!), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.azure_client_id!,
      client_secret: c.azure_client_secret!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPE_DELEGADO,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "No se pudo canjear el código.");

  let cuenta = "";
  try {
    const me = await fetch(`${GRAPH}/me`, { headers: { authorization: `Bearer ${data.access_token}` } });
    const mj = await me.json();
    cuenta = mj.mail || mj.userPrincipalName || "";
  } catch {
    /* la cuenta es solo informativa */
  }
  return { refresh_token: data.refresh_token, cuenta };
}

// Access token app-only (client credentials): no requiere intervención del usuario.
async function tokenAppOnly(c: ConfigCorreo): Promise<string> {
  const res = await fetch(urlToken(c.azure_tenant_id!), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.azure_client_id!,
      client_secret: c.azure_client_secret!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Fallo al obtener el token de aplicación.");
  return data.access_token;
}

// Access token interactivo: renueva con el refresh token guardado. Azure rota el
// refresh token, así que persistimos el nuevo si llega uno distinto.
async function tokenInteractivo(c: ConfigCorreo, sb: SupabaseClient): Promise<string> {
  const res = await fetch(urlToken(c.azure_tenant_id!), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.azure_client_id!,
      client_secret: c.azure_client_secret!,
      refresh_token: c.oauth_refresh_token!,
      grant_type: "refresh_token",
      scope: SCOPE_DELEGADO,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Sesión de Microsoft expirada; vuelve a conectar.");
  if (data.refresh_token && data.refresh_token !== c.oauth_refresh_token) {
    await sb.from("config_correo").update({ oauth_refresh_token: data.refresh_token }).eq("id", 1);
  }
  return data.access_token;
}

// Envía por Microsoft Graph (sendMail). 202 Accepted = aceptado para entrega.
async function enviarGraph(
  accessToken: string,
  endpoint: string,
  html: string,
  msg: { destinatarios: string[]; asunto: string },
): Promise<Resultado> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: msg.asunto,
        body: { contentType: "HTML", content: html },
        toRecipients: msg.destinatarios.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
  if (res.ok || res.status === 202) return { ok: true };
  let detalle = `Microsoft Graph respondió ${res.status}`;
  try {
    const e = await res.json();
    detalle = e?.error?.message ? `${detalle}: ${e.error.message}` : detalle;
  } catch {
    /* sin cuerpo JSON */
  }
  return { ok: false, motivo: "error", detalle };
}

// ---------- SMTP (legado) ----------
function transporte(c: ConfigCorreo): Transporter {
  return nodemailer.createTransport({
    host: c.smtp_host,
    port: c.smtp_port,
    secure: c.smtp_port === 465,     // 465 = TLS directo; 587 = STARTTLS
    requireTLS: c.smtp_port !== 465, // M365 exige cifrar
    auth: { user: c.smtp_user!, pass: c.smtp_pass! },
  });
}

function render(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

const AZUL = "#294466", VERDE = "#7F9D41", TINTA = "#1A1A1A", SUAVE = "#54595F", LINEA = "#e6e8ec";

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Envuelve el cuerpo (texto plano con saltos de línea) en el HTML de marca PIMSA.
// `cta` es el botón opcional (texto + destino); si falta, no se pinta.
function htmlMarca(cuerpoTexto: string, cta: { texto: string; url: string } | null): string {
  const cuerpo = escapar(cuerpoTexto).replace(/\n/g, "<br>");
  const boton = cta
    ? `<tr><td style="padding:4px 28px 26px;"><a href="${escapar(cta.url)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">${escapar(cta.texto)}</a></td></tr>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${TINTA};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINEA};border-radius:14px;overflow:hidden;">
<tr><td style="height:4px;background:${VERDE};"></td></tr>
<tr><td style="padding:22px 28px 6px;"><div style="font-size:13px;font-weight:700;letter-spacing:.04em;color:${AZUL};text-transform:uppercase;">Soporte TI · Plásticos PIMSA</div></td></tr>
<tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.6;color:${TINTA};">${cuerpo}</td></tr>
${boton}
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINEA};font-size:12px;color:${SUAVE};">Mensaje del portal de soporte de TI. Responde a este correo si necesitas más ayuda.</td></tr>
</table>
<div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#9aa0a6;">Plásticos PIMSA</div>
</td></tr></table></body></html>`;
}

// ---------- Envío unificado ----------
// Despacha según el método configurado. Recibe `sb` para poder persistir el refresh
// token rotado en el flujo interactivo.
async function enviar(
  c: ConfigCorreo,
  sb: SupabaseClient,
  msg: { para: string | string[]; asunto: string; cuerpo: string; cta?: { texto: string; url: string } | null },
): Promise<Resultado> {
  // CTA por defecto: el botón "Ver mis reportes" al portal; las funciones que mandan
  // a TI pasan su propio CTA (enlace directo al ticket).
  const cta = msg.cta === undefined ? (c.sitio_url ? { texto: "Ver mis reportes", url: c.sitio_url } : null) : msg.cta;
  const html = htmlMarca(msg.cuerpo, cta);
  const destinatarios = (Array.isArray(msg.para) ? msg.para : [msg.para]).filter(Boolean);
  if (destinatarios.length === 0) return { ok: false, motivo: "no_config", detalle: "Sin destinatarios." };
  try {
    if (c.metodo === "graph_app") {
      const token = await tokenAppOnly(c);
      const mb = encodeURIComponent(buzon(c));
      return await enviarGraph(token, `${GRAPH}/users/${mb}/sendMail`, html, { destinatarios, asunto: msg.asunto });
    }
    if (c.metodo === "oauth_interactivo") {
      const token = await tokenInteractivo(c, sb);
      return await enviarGraph(token, `${GRAPH}/me/sendMail`, html, { destinatarios, asunto: msg.asunto });
    }
    await transporte(c).sendMail({
      from: `"${c.remitente_nombre}" <${c.remitente || c.smtp_user}>`,
      to: destinatarios.join(", "),
      subject: msg.asunto,
      text: msg.cuerpo,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[correo] fallo al enviar:", e);
    return { ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) };
  }
}

export function enviarRespuesta(
  c: ConfigCorreo,
  sb: SupabaseClient,
  d: { para: string; num: number; titulo: string; nombre: string; mensaje: string },
): Promise<Resultado> {
  const vars = { folio: folio(d.num), titulo: d.titulo, nombre: d.nombre, mensaje: d.mensaje };
  return enviar(c, sb, { para: d.para, asunto: render(c.asunto_respuesta, vars), cuerpo: render(c.cuerpo_respuesta, vars) });
}

export function enviarEstado(
  c: ConfigCorreo,
  sb: SupabaseClient,
  d: { para: string; num: number; titulo: string; nombre: string; estado: string },
): Promise<Resultado> {
  const vars = { folio: folio(d.num), titulo: d.titulo, nombre: d.nombre, estado: d.estado };
  return enviar(c, sb, { para: d.para, asunto: render(c.asunto_estado, vars), cuerpo: render(c.cuerpo_estado, vars) });
}

// Destinatarios del aviso interno: lista separada por coma, punto y coma o saltos
// de línea; se quedan solo los correos con forma válida.
export function destinosNuevo(c: ConfigCorreo): string[] {
  return (c.notif_nuevo_destinos ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

// ¿Toca avisar a TI de un ticket nuevo? Servicio operativo + aviso encendido + hay a quién.
export function avisaNuevo(c: ConfigCorreo | null): c is ConfigCorreo {
  return correoOperativo(c) && c.notif_nuevo && destinosNuevo(c).length > 0;
}

// Aviso interno a TI cuando entra un ticket desde el portal. Lleva botón al detalle.
export function enviarNuevoTicket(
  c: ConfigCorreo,
  sb: SupabaseClient,
  d: { num: number; titulo: string; solicitante: string; categoria: string; descripcion: string; enlace: string | null },
): Promise<Resultado> {
  const vars = {
    folio: folio(d.num),
    titulo: d.titulo,
    solicitante: d.solicitante,
    categoria: d.categoria,
    descripcion: d.descripcion || "(sin descripción)",
    enlace: d.enlace ?? "",
  };
  return enviar(c, sb, {
    para: destinosNuevo(c),
    asunto: render(c.asunto_nuevo, vars),
    cuerpo: render(c.cuerpo_nuevo, vars),
    cta: d.enlace ? { texto: "Abrir el ticket", url: d.enlace } : null,
  });
}

// Aviso al solicitante cuando TI le abre un ticket a su nombre desde el panel.
// Mensaje fijo (no usa plantilla de config_correo) con el CTA por defecto al portal.
export function enviarTicketCreado(
  c: ConfigCorreo,
  sb: SupabaseClient,
  d: { para: string; num: number; titulo: string; nombre: string },
): Promise<Resultado> {
  const cuerpo =
    `Hola ${d.nombre},\n\n` +
    `El equipo de TI abrió un ticket de soporte a tu nombre:\n` +
    `${folio(d.num)} — ${d.titulo}\n\n` +
    `Puedes seguir su avance desde el portal de soporte. Te avisaremos cuando haya novedades.`;
  return enviar(c, sb, { para: d.para, asunto: `Ticket abierto a tu nombre · ${folio(d.num)}`, cuerpo });
}

export function enviarPrueba(c: ConfigCorreo, sb: SupabaseClient, para: string): Promise<Resultado> {
  return enviar(c, sb, {
    para,
    asunto: "Correo de prueba · Soporte TI PIMSA",
    cuerpo: "Hola,\n\nEste es un correo de prueba del portal de soporte de TI. Si lo recibes, la configuración está funcionando correctamente.",
  });
}
