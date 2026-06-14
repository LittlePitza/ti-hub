import { cookies } from "next/headers";

// Identidad del portal del empleado: una cookie HttpOnly con su correo.
// Sin contraseña a propósito (decisión de Fase 2): el empleado solo escribe su
// correo y el portal le muestra sus equipos y sus tickets.
export const COOKIE_PORTAL = "portal_correo";

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function correoValido(correo: string): boolean {
  return RE_CORREO.test(correo);
}

export async function getCorreoPortal(): Promise<string | null> {
  const jar = await cookies();
  const correo = jar.get(COOKIE_PORTAL)?.value?.trim().toLowerCase() ?? "";
  return correoValido(correo) ? correo : null;
}

// "luis.hernandez@..." -> "Luis" (saludo amigable sin pedir el nombre).
export function nombreDeCorreo(correo: string): string {
  const local = correo.split("@")[0];
  const primera = local.split(/[._-]/)[0] || local;
  return primera.charAt(0).toUpperCase() + primera.slice(1);
}

// Categorías en lenguaje del empleado (mapean a los valores de la BD).
export const CATEGORIAS_PORTAL: { valor: string; titulo: string; detalle: string }[] = [
  { valor: "hardware", titulo: "Mi equipo",       detalle: "Computadora, impresora, pantalla, teclado…" },
  { valor: "software", titulo: "Un programa",     detalle: "No abre, marca error o necesito instalarlo" },
  { valor: "red",      titulo: "Internet o red",  detalle: "Sin conexión, lenta o se corta" },
  { valor: "accesos",  titulo: "Accesos",         detalle: "Contraseñas, permisos a carpetas o sistemas" },
  { valor: "correo",   titulo: "Correo",          detalle: "No envía, no recibe o problemas con Outlook" },
  { valor: "otro",     titulo: "Otra cosa",       detalle: "Algo que no encaja en lo demás" },
];

// Estado del ticket en palabras del empleado, con tono para `.insignia`.
export const ESTADO_PORTAL: Record<string, { texto: string; tono: string; paso: number }> = {
  abierto:    { texto: "Recibido",     tono: "info",   paso: 1 },
  en_proceso: { texto: "En atención",  tono: "aviso",  paso: 2 },
  en_espera:  { texto: "En espera",    tono: "info",   paso: 2 },
  reabierto:  { texto: "Reabierto",    tono: "aviso",  paso: 2 },
  resuelto:   { texto: "Resuelto",     tono: "ok",     paso: 3 },
  cerrado:    { texto: "Cerrado",      tono: "neutro", paso: 3 },
};
