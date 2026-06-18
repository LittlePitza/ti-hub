// Generador de firmas de correo en HTML (marca PIMSA). Función pura, sin
// dependencias de servidor: se usa tanto en el Server Component (datos iniciales)
// como en el cliente (vista previa en vivo y copiado). El HTML es "email-safe":
// tabla + estilos inline + fuentes web-safe, para que se vea bien en Outlook/Gmail.

export type DatosFirma = {
  nombre: string;
  puesto: string;
  departamento: string;
  correo: string;
  extension: string;
  web: string;
  direccion: string;
  eslogan: string;
};

// Valores de empresa por defecto (editables y configurables en el panel).
export const EMPRESA_DEFAULT = {
  web: "plasticospimsa.com",
  direccion: "Santa Catarina, N.L.",
  eslogan: "Más que reciclaje, una visión al futuro",
};

const AZUL = "#294466";
const VERDE = "#7f9d41";
const TINTA = "#1a1a1a";
const SUAVE = "#54595f";

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Texto de la web sin protocolo (para mostrar) y href normalizado a https.
function web(raw: string): { txt: string; href: string } {
  const limpio = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return { txt: limpio, href: limpio ? `https://${limpio}` : "" };
}

// Firma como fragmento HTML (una tabla). Es lo que se pega en el cliente de correo.
export function firmaCorreoHtml(d: DatosFirma, logoUrl: string): string {
  const e = escapar;
  const sub = [d.puesto, d.departamento].map((s) => s.trim()).filter(Boolean).map(e).join(" &middot; ");
  const w = web(d.web);

  const filas: string[] = [];
  const correo = d.correo.trim();
  if (correo) filas.push(`<a href="mailto:${e(correo)}" style="color:${AZUL};text-decoration:none;">${e(correo)}</a>`);
  if (d.extension.trim()) filas.push(`Ext. ${e(d.extension.trim())}`);
  if (w.txt) filas.push(`<a href="${e(w.href)}" style="color:${VERDE};text-decoration:none;">${e(w.txt)}</a>`);
  if (d.direccion.trim()) filas.push(e(d.direccion.trim()));
  const contacto = filas.map((f) => `<span style="display:block;">${f}</span>`).join("");

  const eslogan = d.eslogan.trim()
    ? `<div style="font-size:11px;color:${VERDE};font-style:italic;padding-top:6px;">${e(d.eslogan.trim())}</div>`
    : "";

  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:${TINTA};">
<tr>
<td valign="top" style="padding:0 16px 0 0;"><img src="${e(logoUrl)}" width="64" alt="Plásticos PIMSA" style="display:block;border:0;outline:none;text-decoration:none;width:64px;height:auto;"></td>
<td valign="top" style="border-left:3px solid ${VERDE};padding:0 0 0 16px;">
<div style="font-size:15px;font-weight:700;color:${AZUL};letter-spacing:.02em;">${e(d.nombre.trim()) || "Nombre Apellido"}</div>
${sub ? `<div style="font-size:12px;color:${SUAVE};padding-top:2px;">${sub}</div>` : ""}
<div style="font-size:12px;font-weight:600;color:${AZUL};padding-top:6px;">Plásticos PIMSA</div>
<div style="font-size:12px;color:${SUAVE};padding-top:6px;line-height:1.7;">${contacto}</div>
${eslogan}
</td>
</tr>
</table>`;
}

// Envuelve el fragmento en un documento HTML completo (para descargar como .html).
export function documentoFirma(fragmento: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Firma de correo · Plásticos PIMSA</title></head><body style="margin:0;padding:16px;">${fragmento}</body></html>`;
}

// Versión en texto plano (para el portapapeles y clientes sin HTML).
export function firmaTextoPlano(d: DatosFirma): string {
  const sub = [d.puesto, d.departamento].map((s) => s.trim()).filter(Boolean).join(" · ");
  const ext = d.extension.trim() ? `Ext. ${d.extension.trim()}` : "";
  return [d.nombre.trim(), sub, "Plásticos PIMSA", d.correo.trim(), ext, d.web.trim(), d.direccion.trim(), d.eslogan.trim()]
    .filter(Boolean)
    .join("\n");
}
