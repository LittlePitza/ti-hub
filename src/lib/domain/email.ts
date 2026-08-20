import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ticketFolio } from "../utils/format";
import { type SlaTable, SLA_DEFAULTS, SLA_DUE_SOON_PCT_DEFAULT } from "./tickets";

// Email configuration is managed from the panel (/ti/correo), not from env vars.
// It lives in the single `config_correo` row (id = 1). IT triggers sending per
// ticket (it is not automatic); this module only holds how to send and with
// which templates.
//
// Three send methods (Microsoft 365 retires SMTP basic auth at the end of 2026):
//  - smtp_basico: username/password over SMTP (legacy).
//  - graph_app: app-only (client credentials) through Microsoft Graph. Never
//    expires and sends as a fixed mailbox. Needs the Mail.Send application
//    permission with admin consent.
//  - oauth_interactivo: "Sign in with Microsoft"; stores a refresh token and
//    sends as the account that connected. Delegated Mail.Send permission.
export type EmailMethod = "smtp_basico" | "graph_app" | "oauth_interactivo";

export type EmailConfig = {
  activo: boolean;
  metodo: EmailMethod;
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
  // Defaults for the employee email signature (null = use the code constant).
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
  // Configurable SLA (clock hours). null = fall back to lib/domain/tickets.ts.
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

// Builds the active SLA table by merging the config_correo overrides over the
// code defaults (NULL in the database = use the code value).
export function resolveSla(config: EmailConfig | null): { sla: SlaTable; porVencerPct: number } {
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
    porVencerPct: config?.sla_por_vencer_pct ?? SLA_DUE_SOON_PCT_DEFAULT,
  };
}

export async function getEmailConfig(sb: SupabaseClient): Promise<EmailConfig | null> {
  const { data } = await sb.from("config_correo").select("*").eq("id", 1).maybeSingle();
  return (data as EmailConfig) ?? null;
}

// The mailbox we send from (explicit sender, or the configured user).
function mailbox(c: EmailConfig): string {
  return c.remitente || c.smtp_user || c.oauth_cuenta || "";
}

// Whether the configured method has credentials to send with — the test message
// uses this even while the service itself is switched off.
export function hasCredentials(c: EmailConfig | null): c is EmailConfig {
  if (!c) return false;
  if (c.metodo === "graph_app")
    return Boolean(c.azure_tenant_id && c.azure_client_id && c.azure_client_secret && mailbox(c));
  if (c.metodo === "oauth_interactivo")
    return Boolean(
      c.azure_tenant_id && c.azure_client_id && c.azure_client_secret && c.oauth_refresh_token,
    );
  return Boolean(c.smtp_user && c.smtp_pass && (c.remitente || c.smtp_user));
}
// Ready to actually notify: credentials present and the master switch is on.
export function isEmailReady(c: EmailConfig | null): c is EmailConfig {
  return hasCredentials(c) && c.activo;
}

type SendResult = { ok: true } | { ok: false; motivo: "no_config" | "error"; detail?: string };

// ---------- OAuth2 / Microsoft Entra ID ----------
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE_DELEGADO = "https://graph.microsoft.com/Mail.Send offline_access openid email";

function tokenUrl(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

// URL the admin is sent to in order to sign in and consent (interactive flow).
export function authorizationUrl(c: EmailConfig, redirectUri: string, state: string): string {
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

// Exchanges the callback code for tokens; returns the refresh token and the
// account that connected.
export async function exchangeCode(
  c: EmailConfig,
  code: string,
  redirectUri: string,
): Promise<{ refresh_token: string; cuenta: string }> {
  const res = await fetch(tokenUrl(c.azure_tenant_id!), {
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
  if (!res.ok)
    throw new Error(data.error_description || data.error || "No se pudo canjear el código.");

  let cuenta = "";
  try {
    const me = await fetch(`${GRAPH}/me`, {
      headers: { authorization: `Bearer ${data.access_token}` },
    });
    const mj = await me.json();
    cuenta = mj.mail || mj.userPrincipalName || "";
  } catch {
    /* the account is informational only */
  }
  return { refresh_token: data.refresh_token, cuenta };
}

// App-only access token (client credentials): needs no user interaction.
async function tokenAppOnly(c: EmailConfig): Promise<string> {
  const res = await fetch(tokenUrl(c.azure_tenant_id!), {
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
  if (!res.ok)
    throw new Error(
      data.error_description || data.error || "Fallo al obtener el token de aplicación.",
    );
  return data.access_token;
}

// Interactive access token: refreshes using the stored refresh token. Azure
// rotates refresh tokens, so a new one is persisted whenever it differs.
async function interactiveToken(c: EmailConfig, sb: SupabaseClient): Promise<string> {
  const res = await fetch(tokenUrl(c.azure_tenant_id!), {
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
  if (!res.ok)
    throw new Error(
      data.error_description || data.error || "Sesión de Microsoft expirada; vuelve a conectar.",
    );
  if (data.refresh_token && data.refresh_token !== c.oauth_refresh_token) {
    await sb.from("config_correo").update({ oauth_refresh_token: data.refresh_token }).eq("id", 1);
  }
  return data.access_token;
}

// Sends through Microsoft Graph (sendMail). 202 Accepted = queued for delivery.
async function sendViaGraph(
  accessToken: string,
  endpoint: string,
  html: string,
  msg: { destinatarios: string[]; asunto: string },
): Promise<SendResult> {
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
  let detail = `Microsoft Graph respondió ${res.status}`;
  try {
    const e = await res.json();
    detail = e?.error?.message ? `${detail}: ${e.error.message}` : detail;
  } catch {
    /* no JSON body */
  }
  return { ok: false, motivo: "error", detail };
}

// ---------- SMTP (legacy) ----------
function transport(c: EmailConfig): Transporter {
  return nodemailer.createTransport({
    host: c.smtp_host,
    port: c.smtp_port,
    secure: c.smtp_port === 465, // 465 = TLS directo; 587 = STARTTLS
    requireTLS: c.smtp_port !== 465, // M365 exige cifrar
    auth: { user: c.smtp_user!, pass: c.smtp_pass! },
  });
}

function render(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

const AZUL = "#294466",
  VERDE = "#7F9D41",
  TINTA = "#1A1A1A",
  SUAVE = "#54595F",
  LINEA = "#e6e8ec";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

// Wraps the body (plain text with line breaks) in the PIMSA-branded HTML.
// `cta` is the optional button (label + target); when absent, none is drawn.
function brandedHtml(cuerpoTexto: string, cta: { text: string; url: string } | null): string {
  const cuerpo = escapeHtml(cuerpoTexto).replace(/\n/g, "<br>");
  const boton = cta
    ? `<tr><td style="padding:4px 28px 26px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">${escapeHtml(cta.text)}</a></td></tr>`
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

// ---------- Unified send ----------
// Dispatches on the configured method. Takes `sb` so it can persist the rotated
// refresh token in the interactive flow.
async function send(
  c: EmailConfig,
  sb: SupabaseClient,
  msg: {
    para: string | string[];
    asunto: string;
    cuerpo: string;
    cta?: { text: string; url: string } | null;
  },
): Promise<SendResult> {
  // Default CTA: the "Ver mis reportes" button pointing at the portal. The
  // functions that write to IT pass their own CTA (a direct ticket link).
  const cta =
    msg.cta === undefined
      ? c.sitio_url
        ? { text: "Ver mis reportes", url: c.sitio_url }
        : null
      : msg.cta;
  const html = brandedHtml(msg.cuerpo, cta);
  const destinatarios = (Array.isArray(msg.para) ? msg.para : [msg.para]).filter(Boolean);
  if (destinatarios.length === 0)
    return { ok: false, motivo: "no_config", detail: "Sin destinatarios." };
  try {
    if (c.metodo === "graph_app") {
      const token = await tokenAppOnly(c);
      const mb = encodeURIComponent(mailbox(c));
      return await sendViaGraph(token, `${GRAPH}/users/${mb}/sendMail`, html, {
        destinatarios,
        asunto: msg.asunto,
      });
    }
    if (c.metodo === "oauth_interactivo") {
      const token = await interactiveToken(c, sb);
      return await sendViaGraph(token, `${GRAPH}/me/sendMail`, html, {
        destinatarios,
        asunto: msg.asunto,
      });
    }
    await transport(c).sendMail({
      from: `"${c.remitente_nombre}" <${c.remitente || c.smtp_user}>`,
      to: destinatarios.join(", "),
      subject: msg.asunto,
      text: msg.cuerpo,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[correo] fallo al enviar:", e);
    return { ok: false, motivo: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

export function sendReply(
  c: EmailConfig,
  sb: SupabaseClient,
  d: { para: string; num: number; titulo: string; nombre: string; mensaje: string },
): Promise<SendResult> {
  const vars = {
    folio: ticketFolio(d.num),
    titulo: d.titulo,
    nombre: d.nombre,
    mensaje: d.mensaje,
  };
  return send(c, sb, {
    para: d.para,
    asunto: render(c.asunto_respuesta, vars),
    cuerpo: render(c.cuerpo_respuesta, vars),
  });
}

export function sendStatusUpdate(
  c: EmailConfig,
  sb: SupabaseClient,
  d: { para: string; num: number; titulo: string; nombre: string; estado: string },
): Promise<SendResult> {
  const vars = { folio: ticketFolio(d.num), titulo: d.titulo, nombre: d.nombre, estado: d.estado };
  return send(c, sb, {
    para: d.para,
    asunto: render(c.asunto_estado, vars),
    cuerpo: render(c.cuerpo_estado, vars),
  });
}

// Recipients of the internal alert: a list separated by commas, semicolons or
// newlines, keeping only the well-formed addresses.
export function newTicketRecipients(c: EmailConfig): string[] {
  return (c.notif_nuevo_destinos ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

// Should IT be alerted about a new ticket? Service operational, alert enabled,
// and at least one recipient.
export function notifiesOnNewTicket(c: EmailConfig | null): c is EmailConfig {
  return isEmailReady(c) && c.notif_nuevo && newTicketRecipients(c).length > 0;
}

// Internal alert to IT when a ticket arrives from the portal. Carries a button
// straight to the ticket detail.
export function sendNewTicketAlert(
  c: EmailConfig,
  sb: SupabaseClient,
  d: {
    num: number;
    titulo: string;
    solicitante: string;
    categoria: string;
    descripcion: string;
    enlace: string | null;
  },
): Promise<SendResult> {
  const vars = {
    folio: ticketFolio(d.num),
    titulo: d.titulo,
    solicitante: d.solicitante,
    categoria: d.categoria,
    descripcion: d.descripcion || "(sin descripción)",
    enlace: d.enlace ?? "",
  };
  return send(c, sb, {
    para: newTicketRecipients(c),
    asunto: render(c.asunto_nuevo, vars),
    cuerpo: render(c.cuerpo_nuevo, vars),
    cta: d.enlace ? { text: "Abrir el ticket", url: d.enlace } : null,
  });
}

// Receipt to the requester when IT opens a ticket on their behalf from the
// panel. Fixed wording (it does not use a config_correo template) with the
// default CTA to the portal.
export function sendTicketReceipt(
  c: EmailConfig,
  sb: SupabaseClient,
  d: { para: string; num: number; titulo: string; nombre: string },
): Promise<SendResult> {
  const cuerpo =
    `Hola ${d.nombre},\n\n` +
    `El equipo de TI abrió un ticket de soporte a tu nombre:\n` +
    `${ticketFolio(d.num)} — ${d.titulo}\n\n` +
    `Puedes seguir su avance desde el portal de soporte. Te avisaremos cuando haya novedades.`;
  return send(c, sb, {
    para: d.para,
    asunto: `Ticket abierto a tu nombre · ${ticketFolio(d.num)}`,
    cuerpo,
  });
}

export function sendTestEmail(
  c: EmailConfig,
  sb: SupabaseClient,
  para: string,
): Promise<SendResult> {
  return send(c, sb, {
    para,
    asunto: "Correo de prueba · Soporte TI PIMSA",
    cuerpo:
      "Hola,\n\nEste es un correo de prueba del portal de soporte de TI. Si lo recibes, la configuración está funcionando correctamente.",
  });
}
