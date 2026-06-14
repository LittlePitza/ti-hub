import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { folio } from "./format";

// Configuración de correo administrada desde el panel (/ti/correo), no por env.
// Vive en la fila única `config_correo` (id = 1). El envío lo decide TI por ticket
// (no es automático); aquí solo está el cómo enviar y con qué plantillas.
export type ConfigCorreo = {
  activo: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string | null;
  smtp_pass: string | null;
  remitente: string | null;
  remitente_nombre: string;
  sitio_url: string | null;
  notif_respuesta_def: boolean;
  notif_estado_def: boolean;
  asunto_respuesta: string;
  cuerpo_respuesta: string;
  asunto_estado: string;
  cuerpo_estado: string;
};

export async function getConfigCorreo(sb: SupabaseClient): Promise<ConfigCorreo | null> {
  const { data } = await sb.from("config_correo").select("*").eq("id", 1).maybeSingle();
  return (data as ConfigCorreo) ?? null;
}

// Hay credenciales para enviar (sirve para la prueba, aunque el servicio esté apagado).
export function tieneCredenciales(c: ConfigCorreo | null): c is ConfigCorreo {
  return Boolean(c && c.smtp_user && c.smtp_pass && (c.remitente || c.smtp_user));
}
// Listo para notificar de verdad: credenciales + interruptor maestro encendido.
export function correoOperativo(c: ConfigCorreo | null): c is ConfigCorreo {
  return tieneCredenciales(c) && c.activo;
}

type Resultado = { ok: true } | { ok: false; motivo: "no_config" | "error"; detalle?: string };

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
function htmlMarca(cuerpoTexto: string, sitio: string | null): string {
  const cuerpo = escapar(cuerpoTexto).replace(/\n/g, "<br>");
  const cta = sitio
    ? `<tr><td style="padding:4px 28px 26px;"><a href="${escapar(sitio)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Ver mis reportes</a></td></tr>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${TINTA};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINEA};border-radius:14px;overflow:hidden;">
<tr><td style="height:4px;background:${VERDE};"></td></tr>
<tr><td style="padding:22px 28px 6px;"><div style="font-size:13px;font-weight:700;letter-spacing:.04em;color:${AZUL};text-transform:uppercase;">Soporte TI · Plásticos PIMSA</div></td></tr>
<tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.6;color:${TINTA};">${cuerpo}</td></tr>
${cta}
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINEA};font-size:12px;color:${SUAVE};">Mensaje del portal de soporte de TI. Responde a este correo si necesitas más ayuda.</td></tr>
</table>
<div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#9aa0a6;">Plásticos Industriales de Monterrey, S.A. de C.V.</div>
</td></tr></table></body></html>`;
}

async function enviar(c: ConfigCorreo, msg: { para: string; asunto: string; cuerpo: string }): Promise<Resultado> {
  try {
    await transporte(c).sendMail({
      from: `"${c.remitente_nombre}" <${c.remitente || c.smtp_user}>`,
      to: msg.para,
      subject: msg.asunto,
      text: msg.cuerpo,
      html: htmlMarca(msg.cuerpo, c.sitio_url),
    });
    return { ok: true };
  } catch (e) {
    console.error("[correo] fallo al enviar:", e);
    return { ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) };
  }
}

export function enviarRespuesta(
  c: ConfigCorreo,
  d: { para: string; num: number; titulo: string; nombre: string; mensaje: string },
): Promise<Resultado> {
  const vars = { folio: folio(d.num), titulo: d.titulo, nombre: d.nombre, mensaje: d.mensaje };
  return enviar(c, { para: d.para, asunto: render(c.asunto_respuesta, vars), cuerpo: render(c.cuerpo_respuesta, vars) });
}

export function enviarEstado(
  c: ConfigCorreo,
  d: { para: string; num: number; titulo: string; nombre: string; estado: string },
): Promise<Resultado> {
  const vars = { folio: folio(d.num), titulo: d.titulo, nombre: d.nombre, estado: d.estado };
  return enviar(c, { para: d.para, asunto: render(c.asunto_estado, vars), cuerpo: render(c.cuerpo_estado, vars) });
}

export function enviarPrueba(c: ConfigCorreo, para: string): Promise<Resultado> {
  return enviar(c, {
    para,
    asunto: "Correo de prueba · Soporte TI PIMSA",
    cuerpo: "Hola,\n\nEste es un correo de prueba del portal de soporte de TI. Si lo recibes, la configuración SMTP está funcionando correctamente.",
  });
}
