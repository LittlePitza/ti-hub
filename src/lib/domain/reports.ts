// Monthly reports: the month-end cut IT presents as its KPIs.
// Everything is DERIVED from the existing tables (tickets, incidentes,
// mantenimientos): no new tables, no snapshots — a past month can always be
// reconstructed because the timestamps (created_at, primera_respuesta_at,
// resuelto_at, inicio/fin) are immutable once they happen.
//
// Cohort convention (standard help-desk practice):
//   - "created"   = tickets whose created_at falls in the month.
//   - "responded" = tickets whose FIRST RESPONSE landed in the month (even if
//                   they were created earlier); the response SLA is measured on
//                   these.
//   - "resolved"  = tickets whose resuelto_at landed in the month; the
//                   resolution SLA is measured on these. This way the month
//                   grades the work done in the month, not the fate of what
//                   came in.
//   - "backlog"   = tickets created before the cut-off and still unresolved at
//                   the cut-off (for the current month, the cut-off is "now").

import {
  evaluateResponse,
  evaluateResolution,
  SLA_DEFAULTS,
  SLA_DUE_SOON_PCT_DEFAULT,
  type SlaTable,
} from "./tickets";

// ---------- Months (a "YYYY-MM" key) ----------

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

// Month bounds in epoch milliseconds, in server local time: [start, end).
export function monthRange(clave: string): { inicio: number; fin: number } {
  const [anio, mes] = clave.split("-").map(Number);
  return {
    inicio: new Date(anio, mes - 1, 1).getTime(),
    fin: new Date(anio, mes, 1).getTime(),
  };
}

// Neighbouring month: adjacentMonth("2026-01", -1) -> "2025-12".
export function adjacentMonth(clave: string, delta: number): string {
  const [anio, mes] = clave.split("-").map(Number);
  return monthKey(new Date(anio, mes - 1 + delta, 1));
}

// The last n months ending at `key`, in chronological order.
export function recentMonths(clave: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => adjacentMonth(clave, i - (n - 1)));
}

// "2026-07" -> "Julio 2026" (for the month picker and the report title).
export function monthLabel(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  const nombre = new Date(anio, mes - 1, 1).toLocaleDateString("es-MX", { month: "long" });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

// "2026-07" -> "jul" (compact labels for the trend chart).
export function shortMonthLabel(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  return new Date(anio, mes - 1, 1)
    .toLocaleDateString("es-MX", { month: "short" })
    .replace(".", "");
}

const dentro = (ts: string | null | undefined, r: { inicio: number; fin: number }) => {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return t >= r.inicio && t < r.fin;
};

// ---------- Tickets ----------

export interface ReportTicket {
  estado: string;
  prioridad: string;
  categoria: string;
  created_at: string;
  primera_respuesta_at: string | null;
  resuelto_at: string | null;
}

export interface TicketReport {
  creados: number;
  resueltos: number;
  backlogCierre: number;
  porCategoria: Record<string, number>; // of the tickets created in the month
  porPrioridad: Record<string, number>; // of the tickets created in the month
  respuesta: { atendidos: number; enSla: number; pct: number | null; promedioMs: number | null };
  resolucion: { enSla: number; pct: number | null; promedioMs: number | null };
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function ticketReport(
  tickets: ReportTicket[],
  clave: string,
  sla: SlaTable = SLA_DEFAULTS,
  porVencerPct: number = SLA_DUE_SOON_PCT_DEFAULT,
  ahora: number = Date.now(),
): TicketReport {
  const r = monthRange(clave);
  const cierre = Math.min(r.fin, ahora); // current month: the cut-off is "now"

  const creados = tickets.filter((t) => dentro(t.created_at, r));
  const porCategoria: Record<string, number> = {};
  const porPrioridad: Record<string, number> = {};
  for (const t of creados) {
    porCategoria[t.categoria] = (porCategoria[t.categoria] ?? 0) + 1;
    porPrioridad[t.prioridad] = (porPrioridad[t.prioridad] ?? 0) + 1;
  }

  // Response SLA: the cohort responded to within the month. Because
  // primera_respuesta_at is already stamped, evaluateResponse is deterministic
  // and does not depend on "now".
  const atendidos = tickets.filter((t) => dentro(t.primera_respuesta_at, r));
  const evalRespuesta = atendidos.map((t) => evaluateResponse(t, ahora, sla, porVencerPct));
  const respuestaEnSla = evalRespuesta.filter((e) => e.slaStatus === "cumplido").length;

  // Resolution SLA: the cohort resolved within the month (resuelto_at stamped).
  const resueltos = tickets.filter((t) => dentro(t.resuelto_at, r));
  const evalResolucion = resueltos.map((t) => evaluateResolution(t, ahora, sla, porVencerPct));
  const resolucionEnSla = evalResolucion.filter((e) => e.slaStatus === "cumplido").length;

  const backlogCierre = tickets.filter((t) => {
    const creado = new Date(t.created_at).getTime();
    if (creado >= cierre) return false;
    return !t.resuelto_at || new Date(t.resuelto_at).getTime() >= cierre;
  }).length;

  return {
    creados: creados.length,
    resueltos: resueltos.length,
    backlogCierre,
    porCategoria,
    porPrioridad,
    respuesta: {
      atendidos: atendidos.length,
      enSla: respuestaEnSla,
      pct: atendidos.length ? Math.round((respuestaEnSla / atendidos.length) * 100) : null,
      promedioMs: promedio(evalRespuesta.map((e) => e.ms)),
    },
    resolucion: {
      enSla: resolucionEnSla,
      pct: resueltos.length ? Math.round((resolucionEnSla / resueltos.length) * 100) : null,
      promedioMs: promedio(evalResolucion.map((e) => e.ms)),
    },
  };
}

// Monthly created-vs-resolved series, for the trend chart.
export interface SeriesPoint {
  clave: string;
  creados: number;
  resueltos: number;
}

export function monthlySeries(tickets: ReportTicket[], claves: string[]): SeriesPoint[] {
  return claves.map((clave) => {
    const r = monthRange(clave);
    return {
      clave,
      creados: tickets.filter((t) => dentro(t.created_at, r)).length,
      resueltos: tickets.filter((t) => dentro(t.resuelto_at, r)).length,
    };
  });
}

// ---------- Incidents (systems status) ----------

export interface ReportIncident {
  servicio_id: string;
  tipo: string;
  estado: string;
  inicio: string;
  fin: string | null;
}

// What the detail table needs on top of the basics (folio and title).
export interface IncidentDetail extends ReportIncident {
  num: number;
  titulo: string;
}

export interface ServiceImpact {
  servicioId: string;
  nombre: string;
  criticidad: string;
  incidentes: number; // incidents that overlapped the month
  msCaida: number; // overlap of `caida` incidents with the month
  msAfectado: number; // overlap of outages plus degradations (maintenance does not count)
  disponibilidad: number; // % of the elapsed month with no full outage
}

// Uptime for the month per service, across the WHOLE catalogue (a service with
// no incidents reports 100% of the window). This is the cut delivered
// separately as the availability KPI.
export interface ServiceAvailability {
  servicioId: string;
  nombre: string;
  criticidad: string;
  msCaida: number; // full outage that overlapped the month
  msOperativo: number; // elapsed window minus outage
  disponibilidad: number; // % of the elapsed span with no full outage
}

export interface IncidentReport {
  iniciados: number; // incidents that started in the month
  resueltos: number; // incidents closed in the month
  abiertosCierre: number; // still open at the cut-off
  msCaidaTotal: number;
  msVentana: number; // span of the month elapsed at the cut-off (the 100% reference)
  mttrMs: number | null; // mean duration of the incidents closed in the month
  disponibilidadPromedio: number | null; // average over the whole catalogue (unaffected services count as 100)
  porTipo: Record<string, number>; // incidents that overlapped the month, by type
  porServicio: ServiceImpact[]; // solo servicios afectados, peor primero
  disponibilidadPorServicio: ServiceAvailability[]; // the whole catalogue, worst first
}

// Milliseconds an incident overlaps the window [start, cut-off).
// An incident with no `fin` is still open: it counts up to the cut-off.
function overlapMs(i: ReportIncident, inicioVentana: number, corte: number): number {
  const desde = Math.max(new Date(i.inicio).getTime(), inicioVentana);
  const hasta = Math.min(i.fin ? new Date(i.fin).getTime() : corte, corte);
  return Math.max(0, hasta - desde);
}

export function incidentReport(
  incidentes: ReportIncident[],
  servicios: { id: string; nombre: string; criticidad: string }[],
  clave: string,
  ahora: number = Date.now(),
): IncidentReport {
  const r = monthRange(clave);
  const corte = Math.min(r.fin, ahora);
  const ventanaMs = Math.max(1, corte - r.inicio); // avoids dividing by zero on day one

  const iniciados = incidentes.filter((i) => dentro(i.inicio, r)).length;
  const cerradosEnMes = incidentes.filter((i) => dentro(i.fin, r));
  const abiertosCierre = incidentes.filter((i) => {
    const inicio = new Date(i.inicio).getTime();
    if (inicio >= corte) return false;
    return !i.fin || new Date(i.fin).getTime() >= corte;
  }).length;

  // MTTR over the cohort closed within the month: the incident's full duration
  // (even if it started in an earlier month), same as ticket resolution.
  const mttrMs = promedio(
    cerradosEnMes.map((i) =>
      Math.max(0, new Date(i.fin!).getTime() - new Date(i.inicio).getTime()),
    ),
  );

  // Breakdown by type of every incident that overlapped the month, not just the
  // ones that started in it.
  const porTipo: Record<string, number> = {};
  for (const i of incidentes) {
    if (overlapMs(i, r.inicio, corte) <= 0) continue;
    porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1;
  }

  const porServicio: ServiceImpact[] = [];
  const disponibilidadPorServicio: ServiceAvailability[] = [];
  let msCaidaTotal = 0;
  let sumaDisponibilidad = 0;

  for (const s of servicios) {
    const propios = incidentes.filter((i) => i.servicio_id === s.id);
    let msCaida = 0;
    let msAfectado = 0;
    let cuantos = 0;
    for (const i of propios) {
      const ms = overlapMs(i, r.inicio, corte);
      if (ms <= 0) continue;
      cuantos++;
      if (i.tipo === "caida") msCaida += ms;
      if (i.tipo === "caida" || i.tipo === "degradado") msAfectado += ms;
    }
    // Availability = % of the elapsed span of the month with no full outage.
    // It is computed over the elapsed span rather than the whole month so the
    // current month does not look artificially better.
    const disponibilidad = Math.max(0, 100 - (msCaida / ventanaMs) * 100);
    sumaDisponibilidad += disponibilidad;
    disponibilidadPorServicio.push({
      servicioId: s.id,
      nombre: s.nombre,
      criticidad: s.criticidad,
      msCaida,
      msOperativo: Math.max(0, ventanaMs - msCaida),
      disponibilidad,
    });
    if (cuantos === 0) continue;
    msCaidaTotal += msCaida;
    porServicio.push({
      servicioId: s.id,
      nombre: s.nombre,
      criticidad: s.criticidad,
      incidentes: cuantos,
      msCaida,
      msAfectado,
      disponibilidad,
    });
  }

  porServicio.sort((a, b) => b.msAfectado - a.msAfectado || b.incidentes - a.incidentes);
  disponibilidadPorServicio.sort(
    (a, b) => a.disponibilidad - b.disponibilidad || a.nombre.localeCompare(b.nombre, "es"),
  );

  return {
    iniciados,
    resueltos: cerradosEnMes.length,
    abiertosCierre,
    msCaidaTotal,
    msVentana: ventanaMs,
    mttrMs,
    // Averaged over the WHOLE monitored catalogue: services with no outage
    // contribute 100, so the KPI reflects the health of the fleet rather than
    // only of the affected services.
    disponibilidadPromedio: servicios.length ? sumaDisponibilidad / servicios.length : null,
    porTipo,
    porServicio,
    disponibilidadPorServicio,
  };
}

// Monthly incident series for the trend: `creados` = started in the month,
// `resueltos` = closed in the month (same shape as the ticket series).
export function monthlyIncidentSeries(
  incidentes: ReportIncident[],
  claves: string[],
): SeriesPoint[] {
  return claves.map((clave) => {
    const r = monthRange(clave);
    return {
      clave,
      creados: incidentes.filter((i) => dentro(i.inicio, r)).length,
      resueltos: incidentes.filter((i) => dentro(i.fin, r)).length,
    };
  });
}

// Incidents that overlapped the month, with their total duration and whether
// they are still open, newest first (the report's detail table).
export function incidentsInMonth<T extends ReportIncident>(
  incidentes: T[],
  clave: string,
  ahora: number = Date.now(),
): (T & { msDuracion: number; abierto: boolean })[] {
  const r = monthRange(clave);
  const corte = Math.min(r.fin, ahora);
  return incidentes
    .filter((i) => overlapMs(i, r.inicio, corte) > 0)
    .map((i) => ({
      ...i,
      msDuracion: Math.max(
        0,
        (i.fin ? new Date(i.fin).getTime() : ahora) - new Date(i.inicio).getTime(),
      ),
      abierto: !i.fin,
    }))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
}

// Badge tone for a monthly availability figure (internal help desk: 99.5% of a
// month is about 3.6 h of downtime — already worth flagging).
export function availabilityTone(pct: number): string {
  if (pct >= 99.9) return "ok";
  if (pct >= 99) return "aviso";
  return "critico";
}

// ---------- Maintenance ----------

export interface ReportMaintenance {
  tipo: string;
  estado: string;
  fecha_programada: string; // date "YYYY-MM-DD"
}

export interface MaintenanceReport {
  programados: number; // scheduled within the month
  completados: number;
  cancelados: number;
  pendientes: number; // programado / en_proceso, scheduled within the month
  preventivos: number;
  correctivos: number;
  cumplimientoPct: number | null; // completados / (programados − cancelados)
}

export function maintenanceReport(mantos: ReportMaintenance[], clave: string): MaintenanceReport {
  // fecha_programada is a `date`: comparing the "YYYY-MM" prefix is enough.
  const delMes = mantos.filter((m) => m.fecha_programada?.startsWith(clave));
  const completados = delMes.filter((m) => m.estado === "completado").length;
  const cancelados = delMes.filter((m) => m.estado === "cancelado").length;
  const exigibles = delMes.length - cancelados;
  return {
    programados: delMes.length,
    completados,
    cancelados,
    pendientes: delMes.filter((m) => m.estado === "programado" || m.estado === "en_proceso").length,
    preventivos: delMes.filter((m) => m.tipo === "preventivo").length,
    correctivos: delMes.filter((m) => m.tipo === "correctivo").length,
    cumplimientoPct: exigibles > 0 ? Math.round((completados / exigibles) * 100) : null,
  };
}

// ---------- Comparison against the previous month ----------

// Percentage change (null when there is no baseline to compare against).
export function percentChange(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
