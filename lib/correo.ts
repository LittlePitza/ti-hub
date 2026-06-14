import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { folio } from "./format";

// Envío de correo al solicitante vía SMTP (Microsoft 365 por defecto).
// Toda la config vive en variables de entorno; si falta, las funciones son un
// no-op silencioso (igual que el portal sin service role key): nunca rompen una
// server action por un problema de correo.
const HOST = process.env.SMTP_HOST || "smtp.office365.com";
const PORT = Number(process.env.SMTP_PORT ?? 587);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const REMITENTE = process.env.CORREO_REMITENTE || USER || "";
const NOMBRE_REMITENTE = process.env.CORREO_NOMBRE || "Soporte TI · Plásticos PIMSA";
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

export function correoConfigurado(): boolean {
  return Boolean(USER && PASS && REMITENTE);
}

let _transporter: Transporter | null = null;
function transporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,     // 465 = TLS directo; 587 = STARTTLS
      requireTLS: PORT !== 465, // M365 exige cifrar la conexión
      auth: { user: USER, pass: PASS },
    });
  }
  return _transporter;
}

type Resultado = { ok: true } | { ok: false; motivo: "no_config" | "error" };

export async function enviarCorreo(opts: {
  para: string;
  asunto: string;
  html: string;
  texto?: string;
}): Promise<Resultado> {
  if (!correoConfigurado()) return { ok: false, motivo: "no_config" };
  try {
    await transporter().sendMail({
      from: `"${NOMBRE_REMITENTE}" <${REMITENTE}>`,
      to: opts.para,
      subject: opts.asunto,
      text: opts.texto,
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[correo] fallo al enviar:", e);
    return { ok: false, motivo: "error" };
  }
}

// ---------- Plantillas (HTML inline para compatibilidad con clientes de correo) ----------
const AZUL = "#294466";
const VERDE = "#7F9D41";
const TINTA = "#1A1A1A";
const SUAVE = "#54595F";
const LINEA = "#e6e8ec";

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function plantilla(opts: { encabezado: string; intro: string; bloque?: string; estado?: string }): string {
  const cta = BASE
    ? `<tr><td style="padding:8px 28px 28px;">
         <a href="${BASE}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Ver mis reportes</a>
       </td></tr>`
    : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${TINTA};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINEA};border-radius:14px;overflow:hidden;">
        <tr><td style="height:4px;background:${VERDE};"></td></tr>
        <tr><td style="padding:22px 28px 4px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:.04em;color:${AZUL};text-transform:uppercase;">Soporte TI · Plásticos PIMSA</div>
        </td></tr>
        <tr><td style="padding:6px 28px 0;">
          <h1 style="margin:0;font-size:20px;line-height:1.3;color:${TINTA};">${opts.encabezado}</h1>
        </td></tr>
        ${opts.estado ? `<tr><td style="padding:14px 28px 0;"><span style="display:inline-block;background:#eef3e6;color:${VERDE};font-weight:600;font-size:13px;padding:5px 12px;border-radius:99px;">${opts.estado}</span></td></tr>` : ""}
        <tr><td style="padding:14px 28px 0;font-size:15px;line-height:1.55;color:${SUAVE};">${opts.intro}</td></tr>
        ${opts.bloque ? `<tr><td style="padding:16px 28px 0;"><div style="border-left:3px solid ${VERDE};background:#f7f9f2;border-radius:0 10px 10px 0;padding:12px 16px;font-size:15px;line-height:1.55;color:${TINTA};white-space:pre-wrap;">${opts.bloque}</div></td></tr>` : ""}
        ${cta}
        <tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINEA};font-size:12px;color:${SUAVE};">
          Este es un mensaje automático del portal de soporte. Responde a este correo o levanta otro reporte si necesitas más ayuda.
        </td></tr>
      </table>
      <div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#9aa0a6;">Plásticos Industriales de Monterrey, S.A. de C.V.</div>
    </td></tr>
  </table>
</body></html>`;
}

// Respuesta de TI al solicitante.
export function correoRespuesta(opts: {
  num: number;
  titulo: string;
  mensaje: string;
  nombre?: string | null;
}): { asunto: string; html: string; texto: string } {
  const saludo = opts.nombre ? `Hola ${escapar(opts.nombre)},` : "Hola,";
  const asunto = `Re: ${opts.titulo} (${folio(opts.num)})`;
  const html = plantilla({
    encabezado: "Tienes una respuesta de soporte",
    intro: `${saludo} el equipo de TI respondió a tu reporte <strong>${folio(opts.num)} · ${escapar(opts.titulo)}</strong>:`,
    bloque: escapar(opts.mensaje),
  });
  const texto = `${opts.nombre ? `Hola ${opts.nombre},` : "Hola,"}\n\nEl equipo de TI respondió a tu reporte ${folio(opts.num)} · ${opts.titulo}:\n\n${opts.mensaje}\n\n${BASE ? `Ver tus reportes: ${BASE}` : ""}`;
  return { asunto, html, texto };
}

// Aviso de cambio de estado.
export function correoEstado(opts: {
  num: number;
  titulo: string;
  estadoTexto: string;
  nombre?: string | null;
}): { asunto: string; html: string; texto: string } {
  const saludo = opts.nombre ? `Hola ${escapar(opts.nombre)},` : "Hola,";
  const asunto = `${opts.titulo} ahora está: ${opts.estadoTexto} (${folio(opts.num)})`;
  const html = plantilla({
    encabezado: "Actualizamos tu reporte",
    estado: opts.estadoTexto,
    intro: `${saludo} el estado de tu reporte <strong>${folio(opts.num)} · ${escapar(opts.titulo)}</strong> cambió a <strong>${escapar(opts.estadoTexto)}</strong>.`,
  });
  const texto = `${opts.nombre ? `Hola ${opts.nombre},` : "Hola,"}\n\nEl estado de tu reporte ${folio(opts.num)} · ${opts.titulo} cambió a: ${opts.estadoTexto}.\n\n${BASE ? `Ver tus reportes: ${BASE}` : ""}`;
  return { asunto, html, texto };
}
