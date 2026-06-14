// Dominio de tickets: estados (ciclo de vida tipo mesa de ayuda), prioridades,
// categorías y SLA por prioridad. Centraliza la lógica que comparten el panel de TI
// (lista, detalle, acciones) y el tablero. El esquema (supabase/schema.sql) es la
// fuente de verdad de los valores permitidos; aquí viven etiquetas y reglas de negocio.

export type EstadoTicket =
  | "abierto"
  | "en_proceso"
  | "en_espera"
  | "resuelto"
  | "cerrado"
  | "reabierto";

export type Prioridad = "baja" | "media" | "alta" | "critica";
export type CategoriaTicket = "hardware" | "software" | "red" | "accesos" | "correo" | "otro";

// Metadatos de cada estado. `activo` = sigue en la bandeja de trabajo de TI.
// `cuentaResuelto` = detiene el reloj de resolución. `tono` mapea a `.insignia`.
export const ESTADOS_TICKET: {
  valor: EstadoTicket;
  etiqueta: string;
  tono: string;
  activo: boolean;
  cuentaResuelto: boolean;
}[] = [
  { valor: "abierto",    etiqueta: "Abierto",    tono: "critico", activo: true,  cuentaResuelto: false },
  { valor: "en_proceso", etiqueta: "En proceso", tono: "aviso",   activo: true,  cuentaResuelto: false },
  { valor: "en_espera",  etiqueta: "En espera",  tono: "info",    activo: true,  cuentaResuelto: false },
  { valor: "reabierto",  etiqueta: "Reabierto",  tono: "critico", activo: true,  cuentaResuelto: false },
  { valor: "resuelto",   etiqueta: "Resuelto",   tono: "ok",      activo: false, cuentaResuelto: true  },
  { valor: "cerrado",    etiqueta: "Cerrado",    tono: "neutro",  activo: false, cuentaResuelto: true  },
];

export const PRIORIDADES: Prioridad[] = ["baja", "media", "alta", "critica"];
export const CATEGORIAS_TK: CategoriaTicket[] = ["hardware", "software", "red", "accesos", "correo", "otro"];

export const ESTADOS_ACTIVOS: EstadoTicket[] = ["abierto", "en_proceso", "en_espera", "reabierto"];
export const ESTADOS_RESUELTOS: EstadoTicket[] = ["resuelto", "cerrado"];
// Estados desde los que un ticket todavía espera el primer contacto de TI.
export const ESTADOS_SIN_ATENDER: EstadoTicket[] = ["abierto", "reabierto"];

// Orden de prioridad para listar lo más urgente primero.
export const ORDEN_PRIORIDAD: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

// SLA por prioridad, en horas de reloj. `respuesta` = tiempo objetivo para el primer
// contacto de TI; `resolucion` = tiempo objetivo para dejar el ticket resuelto.
export const SLA: Record<Prioridad, { respuesta: number; resolucion: number }> = {
  critica: { respuesta: 1, resolucion: 4 },
  alta: { respuesta: 4, resolucion: 24 },
  media: { respuesta: 8, resolucion: 48 },
  baja: { respuesta: 24, resolucion: 96 },
};

export function metaEstado(valor: string) {
  return ESTADOS_TICKET.find((e) => e.valor === valor) ?? ESTADOS_TICKET[0];
}

export function esEstadoActivo(valor: string): boolean {
  return ESTADOS_ACTIVOS.includes(valor as EstadoTicket);
}

// Semáforo del SLA. `pausado` aplica a tickets en espera (el reloj se detiene, como en
// las mesas de ayuda); `na` cuando no hay objetivo aplicable.
export type SemaforoSla = "cumplido" | "en_tiempo" | "por_vencer" | "incumplido" | "pausado" | "na";

export interface TicketParaSla {
  prioridad: string;
  estado: string;
  created_at: string;
  primera_respuesta_at?: string | null;
  resuelto_at?: string | null;
}

const MS_HORA = 3_600_000;

function objetivos(prioridad: string) {
  return SLA[(prioridad as Prioridad)] ?? SLA.media;
}

// Evalúa el tiempo de primera respuesta contra el SLA.
export function evaluarRespuesta(t: TicketParaSla, ahora: number = Date.now()) {
  const objetivoMs = objetivos(t.prioridad).respuesta * MS_HORA;
  const creado = new Date(t.created_at).getTime();

  if (t.primera_respuesta_at) {
    const ms = new Date(t.primera_respuesta_at).getTime() - creado;
    return { ms, objetivoMs, semaforo: (ms <= objetivoMs ? "cumplido" : "incumplido") as SemaforoSla, pendiente: false };
  }
  // Aún sin primer contacto.
  if (t.estado === "en_espera") {
    return { ms: ahora - creado, objetivoMs, semaforo: "pausado" as SemaforoSla, pendiente: true };
  }
  const ms = ahora - creado;
  let semaforo: SemaforoSla = "en_tiempo";
  if (ms > objetivoMs) semaforo = "incumplido";
  else if (ms > objetivoMs * 0.8) semaforo = "por_vencer";
  return { ms, objetivoMs, semaforo, pendiente: true };
}

// Evalúa el tiempo de resolución contra el SLA.
export function evaluarResolucion(t: TicketParaSla, ahora: number = Date.now()) {
  const objetivoMs = objetivos(t.prioridad).resolucion * MS_HORA;
  const creado = new Date(t.created_at).getTime();

  if (t.resuelto_at) {
    const ms = new Date(t.resuelto_at).getTime() - creado;
    return { ms, objetivoMs, semaforo: (ms <= objetivoMs ? "cumplido" : "incumplido") as SemaforoSla, pendiente: false };
  }
  if (!ESTADOS_ACTIVOS.includes(t.estado as EstadoTicket)) {
    return { ms: 0, objetivoMs, semaforo: "na" as SemaforoSla, pendiente: false };
  }
  if (t.estado === "en_espera") {
    return { ms: ahora - creado, objetivoMs, semaforo: "pausado" as SemaforoSla, pendiente: true };
  }
  const ms = ahora - creado;
  let semaforo: SemaforoSla = "en_tiempo";
  if (ms > objetivoMs) semaforo = "incumplido";
  else if (ms > objetivoMs * 0.8) semaforo = "por_vencer";
  return { ms, objetivoMs, semaforo, pendiente: true };
}

// Texto y tono para mostrar el semáforo como insignia.
export const SEMAFORO_TEXTO: Record<SemaforoSla, { texto: string; tono: string }> = {
  cumplido: { texto: "En SLA", tono: "ok" },
  en_tiempo: { texto: "En tiempo", tono: "ok" },
  por_vencer: { texto: "Por vencer", tono: "aviso" },
  incumplido: { texto: "Fuera de SLA", tono: "critico" },
  pausado: { texto: "En pausa", tono: "neutro" },
  na: { texto: "—", tono: "neutro" },
};
