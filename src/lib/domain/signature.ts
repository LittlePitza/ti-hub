// HTML email-signature generator (PIMSA branding). A pure function with no
// server dependencies: used both by the Server Component (initial data) and on
// the client (live preview and copy). The HTML is email-safe — a table with
// inline styles and web-safe fonts — so it renders correctly in Outlook and Gmail.

export type SignatureData = {
  nombre: string;
  puesto: string;
  departamento: string;
  correo: string;
  extension: string;
  web: string;
  direccion: string;
  eslogan: string;
};

// Default company details (editable and configurable from the panel).
export const DEFAULT_COMPANY = {
  web: "plasticospimsa.com",
  direccion: "Santa Catarina, N.L.",
  eslogan: "Más que reciclaje, una visión al futuro",
};

const AZUL = "#294466";
const VERDE = "#7f9d41";
const TINTA = "#1a1a1a";
const SUAVE = "#54595f";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

// Website text without the protocol (for display) and an href normalised to https.
function web(raw: string): { txt: string; href: string } {
  const limpio = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return { txt: limpio, href: limpio ? `https://${limpio}` : "" };
}

// The signature as an HTML fragment (a single table). This is what gets pasted
// into the mail client.
export function signatureHtml(d: SignatureData, logoUrl: string): string {
  const e = escapeHtml;
  const sub = [d.puesto, d.departamento]
    .map((s) => s.trim())
    .filter(Boolean)
    .map(e)
    .join(" &middot; ");
  const w = web(d.web);

  const filas: string[] = [];
  const correo = d.correo.trim();
  if (correo)
    filas.push(
      `<a href="mailto:${e(correo)}" style="color:${AZUL};text-decoration:none;">${e(correo)}</a>`,
    );
  if (d.extension.trim()) filas.push(`Ext. ${e(d.extension.trim())}`);
  if (w.txt)
    filas.push(
      `<a href="${e(w.href)}" style="color:${VERDE};text-decoration:none;">${e(w.txt)}</a>`,
    );
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

// Wraps the fragment in a complete HTML document (for downloading as .html).
export function signatureDocument(fragmento: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Firma de correo · Plásticos PIMSA</title></head><body style="margin:0;padding:16px;">${fragmento}</body></html>`;
}

// Plain-text version (for the clipboard and clients without HTML).
export function signaturePlainText(d: SignatureData): string {
  const sub = [d.puesto, d.departamento]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
  const ext = d.extension.trim() ? `Ext. ${d.extension.trim()}` : "";
  return [
    d.nombre.trim(),
    sub,
    "Plásticos PIMSA",
    d.correo.trim(),
    ext,
    d.web.trim(),
    d.direccion.trim(),
    d.eslogan.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}
