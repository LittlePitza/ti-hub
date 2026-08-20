// Tasks and projects: the IT team's own work agenda.
// A project groups tasks; a task with no project lives in the inbox.
//
// A task is done when `completada_at` is stamped — there is no separate boolean
// column (derived status, a single source of truth). Overdue is derived from
// `fecha_limite` against today, the same way `vencida` works for invoices.
// The schema (supabase/schema.sql) is the source of truth for allowed values.

import { todayISO } from "./invoices";

export type TaskPriority = "alta" | "normal";
export type ProjectStatus = "activo" | "pausado" | "completado" | "archivado";

export interface Task {
  id: string;
  titulo: string;
  notas: string | null;
  proyecto_id: string | null;
  prioridad: string;
  fecha_limite: string | null;
  completada_at: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: string;
  fecha_objetivo: string | null;
  created_at: string;
}

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; tone: string }[] = [
  { value: "activo", label: "Activo", tone: "ok" },
  { value: "pausado", label: "En pausa", tone: "aviso" },
  { value: "completado", label: "Completado", tone: "info" },
  { value: "archivado", label: "Archivado", tone: "neutro" },
];

export function projectStatusMeta(value: string) {
  return PROJECT_STATUSES.find((e) => e.value === value) ?? PROJECT_STATUSES[0];
}

export function isTaskDone(t: { completada_at: string | null }): boolean {
  return t.completada_at !== null;
}

// ---------- Grouping the list by due date ----------
// The bucket order is the order they are rendered in; each carries its own tone.
export type TaskBucket = "vencidas" | "hoy" | "semana" | "despues" | "sin_fecha";

export const BUCKETS: { value: TaskBucket; label: string; tone: string }[] = [
  { value: "vencidas", label: "Vencidas", tone: "critico" },
  { value: "hoy", label: "Para hoy", tone: "aviso" },
  { value: "semana", label: "Próximos 7 días", tone: "info" },
  { value: "despues", label: "Más adelante", tone: "neutro" },
  { value: "sin_fecha", label: "Sin fecha", tone: "neutro" },
];

// A YYYY-MM-DD date shifted by n days, respecting the calendar. Works in UTC on
// the string so it does not depend on the process timezone.
function addDays(fecha: string, n: number): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Classifies a PENDING task into its due-date bucket.
export function bucketForTask(t: Task, hoy: string = todayISO()): TaskBucket {
  if (!t.fecha_limite) return "sin_fecha";
  if (t.fecha_limite < hoy) return "vencidas";
  if (t.fecha_limite === hoy) return "hoy";
  if (t.fecha_limite <= addDays(hoy, 7)) return "semana";
  return "despues";
}

// An overdue task = pending with a deadline in the past.
export function isTaskOverdue(t: Task, hoy: string = todayISO()): boolean {
  return !isTaskDone(t) && !!t.fecha_limite && t.fecha_limite < hoy;
}

const RANGO_PRIORIDAD: Record<string, number> = { alta: 0, normal: 1 };

// Orders pending tasks: by date first (undated ones last), then by priority
// (high on top), then by how long ago they were captured.
function comparePending(a: Task, b: Task): number {
  const fa = a.fecha_limite ?? "9999-12-31";
  const fb = b.fecha_limite ?? "9999-12-31";
  if (fa !== fb) return fa.localeCompare(fb);
  const pa = RANGO_PRIORIDAD[a.prioridad] ?? 1;
  const pb = RANGO_PRIORIDAD[b.prioridad] ?? 1;
  if (pa !== pb) return pa - pb;
  return a.created_at.localeCompare(b.created_at);
}

export interface TaskGroup {
  cubo: TaskBucket;
  label: string;
  tone: string;
  tareas: Task[];
}

// Groups PENDING tasks into the due-date buckets (empty buckets are omitted).
export function groupPending(tareas: Task[], hoy: string = todayISO()): TaskGroup[] {
  const pendientes = tareas.filter((t) => !isTaskDone(t));
  return BUCKETS.map((c) => ({
    cubo: c.value,
    label: c.label,
    tone: c.tone,
    tareas: pendientes.filter((t) => bucketForTask(t, hoy) === c.value).sort(comparePending),
  })).filter((g) => g.tareas.length > 0);
}

// ---------- Project progress ----------
export interface ProjectProgress {
  total: number;
  hechas: number;
  pendientes: number;
  vencidas: number;
  pct: number; // 0-100
}

export function projectProgress(tareas: Task[], hoy: string = todayISO()): ProjectProgress {
  const total = tareas.length;
  const hechas = tareas.filter(isTaskDone).length;
  const vencidas = tareas.filter((t) => isTaskOverdue(t, hoy)).length;
  return {
    total,
    hechas,
    pendientes: total - hechas,
    vencidas,
    pct: total === 0 ? 0 : Math.round((hechas / total) * 100),
  };
}

// Summary for the module hero.
export interface TasksSummary {
  pendientes: number;
  vencidas: number;
  hoy: number;
  hechasSemana: number; // completed in the last 7 days
}

export function tasksSummary(tareas: Task[], hoy: string = todayISO()): TasksSummary {
  const desde = addDays(hoy, -7);
  let pendientes = 0;
  let vencidas = 0;
  let hoyCnt = 0;
  let hechasSemana = 0;
  for (const t of tareas) {
    if (isTaskDone(t)) {
      if ((t.completada_at ?? "").slice(0, 10) >= desde) hechasSemana++;
      continue;
    }
    pendientes++;
    const cubo = bucketForTask(t, hoy);
    if (cubo === "vencidas") vencidas++;
    else if (cubo === "hoy") hoyCnt++;
  }
  return { pendientes, vencidas, hoy: hoyCnt, hechasSemana };
}
