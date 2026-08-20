// Tickets: statuses (a help-desk lifecycle), priorities, categories and the SLA
// per priority. This centralises the logic shared by the IT panel (list, detail,
// actions) and the board. The schema (supabase/schema.sql) is the source of
// truth for the allowed values; labels and business rules live here.

export type TicketStatus =
  "abierto" | "en_proceso" | "en_espera" | "resuelto" | "cerrado" | "reabierto" | "archivado";

export type Priority = "baja" | "media" | "alta" | "critica";
export type TicketCategory = "hardware" | "software" | "red" | "accesos" | "correo" | "otro";

// Metadata for each status. `activo` = still in the IT work queue.
// `cuentaResuelto` = stops the resolution clock. `tone` maps to `.insignia`.
export const TICKET_STATUSES: {
  value: TicketStatus;
  label: string;
  tone: string;
  activo: boolean;
  cuentaResuelto: boolean;
}[] = [
  { value: "abierto", label: "Abierto", tone: "critico", activo: true, cuentaResuelto: false },
  {
    value: "en_proceso",
    label: "En proceso",
    tone: "aviso",
    activo: true,
    cuentaResuelto: false,
  },
  { value: "en_espera", label: "En espera", tone: "info", activo: true, cuentaResuelto: false },
  {
    value: "reabierto",
    label: "Reabierto",
    tone: "critico",
    activo: true,
    cuentaResuelto: false,
  },
  // Closed = work finished (still visible; reopens if the requester replies).
  { value: "cerrado", label: "Cerrado", tone: "ok", activo: false, cuentaResuelto: true },
  // Archived = cold storage: leaves the visible workload and lives in its own tab.
  {
    value: "archivado",
    label: "Archivado",
    tone: "neutro",
    activo: false,
    cuentaResuelto: true,
  },
  // `resuelto` is kept for legacy data and the activity log; the current flow
  // closes instead.
  { value: "resuelto", label: "Resuelto", tone: "ok", activo: false, cuentaResuelto: true },
];

export const PRIORITIES: Priority[] = ["baja", "media", "alta", "critica"];
export const TICKET_CATEGORIES: TicketCategory[] = [
  "hardware",
  "software",
  "red",
  "accesos",
  "correo",
  "otro",
];

export const ACTIVE_STATUSES: TicketStatus[] = ["abierto", "en_proceso", "en_espera", "reabierto"];
// Terminal statuses (they stop the resolution clock): closed plus archived.
export const RESOLVED_STATUSES: TicketStatus[] = ["resuelto", "cerrado", "archivado"];
// Closed: work finished, still visible (`resuelto` is the legacy form of closed).
export const CLOSED_STATUSES: TicketStatus[] = ["cerrado", "resuelto"];
// Archived: cold storage, out of the visible workload (its own tab).
export const ARCHIVED_STATUSES: TicketStatus[] = ["archivado"];
// Statuses IT can pick in the selectors: the active work, plus Closed (the
// normal close) and Archived (cold storage).
export const SELECTABLE_STATUSES: TicketStatus[] = [
  "abierto",
  "en_proceso",
  "en_espera",
  "reabierto",
  "cerrado",
  "archivado",
];
// Statuses in which a ticket is still waiting for first contact from IT.
export const UNATTENDED_STATUSES: TicketStatus[] = ["abierto", "reabierto"];

// Priority order, so the most urgent is listed first.
export const PRIORITY_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

// SLA per priority, in clock hours. `respuesta` = target time for the first
// contact from IT; `resolucion` = target time to leave the ticket resolved.
// Based on ITIL 4 for an internal help desk in a manufacturer running
// continuous shifts:
//   Critical (system down / production stopped): response <= 30 min, resolution <= 4 h
//   High (one user fully blocked):               response <= 2 h,   resolution <= 8 h
//   Medium (partially blocked):                  response <= 8 h,   resolution <= 48 h
//   Low (question or improvement):               response <= 24 h,  resolution <= 96 h
// These are the defaults; IT overrides them from /ti/correo (config_correo).
export type SlaTable = Record<Priority, { respuesta: number; resolucion: number }>;

export const SLA_DEFAULTS: SlaTable = {
  critica: { respuesta: 1, resolucion: 4 },
  alta: { respuesta: 4, resolucion: 24 },
  media: { respuesta: 8, resolucion: 48 },
  baja: { respuesta: 24, resolucion: 96 },
};

export const SLA_DUE_SOON_PCT_DEFAULT = 80;

export function statusMeta(value: string) {
  return TICKET_STATUSES.find((e) => e.value === value) ?? TICKET_STATUSES[0];
}

// Membership tests for a status that arrives from Postgres as plain text.
// The cast is confined to these predicates: call sites pass a string and get a
// boolean, so no caller needs `as TicketStatus` (or the `as never` that had
// crept into a few of them, which disables checking altogether).
const includesStatus = (lista: TicketStatus[], value: string) =>
  lista.includes(value as TicketStatus);

export function isActiveStatus(value: string): boolean {
  return includesStatus(ACTIVE_STATUSES, value);
}

export function isResolvedStatus(value: string): boolean {
  return includesStatus(RESOLVED_STATUSES, value);
}

export function isClosedStatus(value: string): boolean {
  return includesStatus(CLOSED_STATUSES, value);
}

export function isArchivedStatus(value: string): boolean {
  return includesStatus(ARCHIVED_STATUSES, value);
}

export function isUnattendedStatus(value: string): boolean {
  return includesStatus(UNATTENDED_STATUSES, value);
}

export function isTicketCategory(value: string): boolean {
  return TICKET_CATEGORIES.includes(value as TicketCategory);
}

export function isPriority(value: string): boolean {
  return PRIORITIES.includes(value as Priority);
}

// The SLA indicator. `pausado` applies to tickets on hold (the clock stops, as
// help desks do); `na` when no target applies.
export type SlaStatus = "cumplido" | "en_tiempo" | "por_vencer" | "incumplido" | "pausado" | "na";

export interface SlaTicket {
  prioridad: string;
  estado: string;
  created_at: string;
  primera_respuesta_at?: string | null;
  resuelto_at?: string | null;
}

const MS_HORA = 3_600_000;

function targets(prioridad: string, sla: SlaTable) {
  return sla[prioridad as Priority] ?? sla.media;
}

// Evaluates the first-response time against the SLA.
// `sla` and `porVencerPct` come from config_correo; when omitted, the defaults
// are used.
export function evaluateResponse(
  t: SlaTicket,
  ahora: number = Date.now(),
  sla: SlaTable = SLA_DEFAULTS,
  porVencerPct: number = SLA_DUE_SOON_PCT_DEFAULT,
) {
  const targetMs = targets(t.prioridad, sla).respuesta * MS_HORA;
  const creado = new Date(t.created_at).getTime();

  if (t.primera_respuesta_at) {
    const ms = new Date(t.primera_respuesta_at).getTime() - creado;
    return {
      ms,
      targetMs,
      slaStatus: (ms <= targetMs ? "cumplido" : "incumplido") as SlaStatus,
      pending: false,
    };
  }
  // No first contact yet.
  if (t.estado === "en_espera") {
    return { ms: ahora - creado, targetMs, slaStatus: "pausado" as SlaStatus, pending: true };
  }
  const ms = ahora - creado;
  let slaStatus: SlaStatus = "en_tiempo";
  if (ms > targetMs) slaStatus = "incumplido";
  else if (ms > targetMs * (porVencerPct / 100)) slaStatus = "por_vencer";
  return { ms, targetMs, slaStatus, pending: true };
}

// Evaluates the resolution time against the SLA.
export function evaluateResolution(
  t: SlaTicket,
  ahora: number = Date.now(),
  sla: SlaTable = SLA_DEFAULTS,
  porVencerPct: number = SLA_DUE_SOON_PCT_DEFAULT,
) {
  const targetMs = targets(t.prioridad, sla).resolucion * MS_HORA;
  const creado = new Date(t.created_at).getTime();

  if (t.resuelto_at) {
    const ms = new Date(t.resuelto_at).getTime() - creado;
    return {
      ms,
      targetMs,
      slaStatus: (ms <= targetMs ? "cumplido" : "incumplido") as SlaStatus,
      pending: false,
    };
  }
  if (!isActiveStatus(t.estado)) {
    return { ms: 0, targetMs, slaStatus: "na" as SlaStatus, pending: false };
  }
  if (t.estado === "en_espera") {
    return { ms: ahora - creado, targetMs, slaStatus: "pausado" as SlaStatus, pending: true };
  }
  const ms = ahora - creado;
  let slaStatus: SlaStatus = "en_tiempo";
  if (ms > targetMs) slaStatus = "incumplido";
  else if (ms > targetMs * (porVencerPct / 100)) slaStatus = "por_vencer";
  return { ms, targetMs, slaStatus, pending: true };
}

// Text and tone for rendering the SLA indicator as a badge.
export const SLA_STATUS_TEXT: Record<SlaStatus, { text: string; tone: string }> = {
  cumplido: { text: "En SLA", tone: "ok" },
  en_tiempo: { text: "En tiempo", tone: "ok" },
  por_vencer: { text: "Por vencer", tone: "aviso" },
  incumplido: { text: "Fuera de SLA", tone: "critico" },
  pausado: { text: "En pausa", tone: "neutro" },
  na: { text: "—", tone: "neutro" },
};
