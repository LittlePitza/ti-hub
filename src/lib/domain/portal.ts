import { cookies } from "next/headers";

// Employee portal identity: an HttpOnly cookie holding their email address.
// Deliberately password-less (a Phase 2 decision): the employee types their
// email once and the portal shows them their devices and their tickets.
export const PORTAL_COOKIE = "portal_correo";

// The company email domain. Since every employee is @plasticospimsa.com, the
// portal asks only for the local part and fills in the domain (see normalizeEmail).
export const EMAIL_DOMAIN = "plasticospimsa.com";

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(correo: string): boolean {
  return RE_CORREO.test(correo);
}

// Normalises whatever the employee types into a full address: anything with an
// "@" is kept as-is (a complete address, or another domain); a bare local part
// gets the PIMSA domain appended. Empty => "".
export function normalizeEmail(bruto: string): string {
  const limpio = bruto.trim().toLowerCase();
  if (!limpio) return "";
  return limpio.includes("@") ? limpio : `${limpio}@${EMAIL_DOMAIN}`;
}

export async function getPortalEmail(): Promise<string | null> {
  const jar = await cookies();
  const correo = jar.get(PORTAL_COOKIE)?.value?.trim().toLowerCase() ?? "";
  return isValidEmail(correo) ? correo : null;
}

// "luis.hernandez@..." -> "Luis" (a friendly greeting without asking for a name).
export function nameFromEmail(correo: string): string {
  const local = correo.split("@")[0];
  const primera = local.split(/[._-]/)[0] || local;
  return primera.charAt(0).toUpperCase() + primera.slice(1);
}

// Categories in the employee's own words (they map onto the database values).
export const PORTAL_CATEGORIES: { value: string; titulo: string; detail: string }[] = [
  { value: "hardware", titulo: "Mi equipo", detail: "Computadora, impresora, pantalla, teclado…" },
  {
    value: "software",
    titulo: "Un programa",
    detail: "No abre, marca error o necesito instalarlo",
  },
  { value: "red", titulo: "Internet o red", detail: "Sin conexión, lenta o se corta" },
  { value: "accesos", titulo: "Accesos", detail: "Contraseñas, permisos a carpetas o sistemas" },
  { value: "correo", titulo: "Correo", detail: "No envía, no recibe o problemas con Outlook" },
  { value: "otro", titulo: "Otra cosa", detail: "Algo que no encaja en lo demás" },
];

// Ticket status in the employee's own words, with a tone for `.insignia`.
export const PORTAL_STATUS: Record<string, { text: string; tone: string; step: number }> = {
  abierto: { text: "Recibido", tone: "info", step: 1 },
  en_proceso: { text: "En atención", tone: "aviso", step: 2 },
  en_espera: { text: "En espera", tone: "info", step: 2 },
  reabierto: { text: "Reabierto", tone: "aviso", step: 2 },
  resuelto: { text: "Resuelto", tone: "ok", step: 3 },
  cerrado: { text: "Cerrado", tone: "neutro", step: 3 },
  archivado: { text: "Archivado", tone: "neutro", step: 3 },
};
