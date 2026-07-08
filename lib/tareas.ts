// Dominio de "Tareas y proyectos": la agenda de trabajo del equipo de TI.
// Un proyecto agrupa tareas; una tarea sin proyecto vive en la "bandeja".
//
// Una tarea está completada cuando tiene `completada_at` sellado — no hay columna
// booleana aparte (estado derivado, un solo lugar de verdad). El vencimiento se
// deriva de `fecha_limite` contra hoy, igual que `vencida` en facturas.
// El esquema (supabase/schema.sql) es la fuente de verdad de los valores permitidos.

import { hoyISO } from "./facturas";

export type PrioridadTarea = "alta" | "normal";
export type EstadoProyecto = "activo" | "pausado" | "completado" | "archivado";

export interface Tarea {
  id: string;
  titulo: string;
  notas: string | null;
  proyecto_id: string | null;
  prioridad: string;
  fecha_limite: string | null;
  completada_at: string | null;
  created_at: string;
}

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: string;
  fecha_objetivo: string | null;
  created_at: string;
}

export const ESTADOS_PROYECTO: { valor: EstadoProyecto; etiqueta: string; tono: string }[] = [
  { valor: "activo", etiqueta: "Activo", tono: "ok" },
  { valor: "pausado", etiqueta: "En pausa", tono: "aviso" },
  { valor: "completado", etiqueta: "Completado", tono: "info" },
  { valor: "archivado", etiqueta: "Archivado", tono: "neutro" },
];

export function metaEstadoProyecto(valor: string) {
  return ESTADOS_PROYECTO.find((e) => e.valor === valor) ?? ESTADOS_PROYECTO[0];
}

export function tareaCompletada(t: { completada_at: string | null }): boolean {
  return t.completada_at !== null;
}

// ---------- Agrupación de la lista por vencimiento ----------
// El orden de los cubos es el orden en que se pintan; cada uno lleva su tono.
export type CuboTarea = "vencidas" | "hoy" | "semana" | "despues" | "sin_fecha";

export const CUBOS: { valor: CuboTarea; etiqueta: string; tono: string }[] = [
  { valor: "vencidas", etiqueta: "Vencidas", tono: "critico" },
  { valor: "hoy", etiqueta: "Para hoy", tono: "aviso" },
  { valor: "semana", etiqueta: "Próximos 7 días", tono: "info" },
  { valor: "despues", etiqueta: "Más adelante", tono: "neutro" },
  { valor: "sin_fecha", etiqueta: "Sin fecha", tono: "neutro" },
];

// Fecha (YYYY-MM-DD) a `hoy + n días`, respetando el calendario. Trabaja en UTC
// sobre el string para no depender de la zona horaria del proceso.
function masDias(fecha: string, n: number): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Clasifica una tarea PENDIENTE en su cubo de vencimiento.
export function cuboDeTarea(t: Tarea, hoy: string = hoyISO()): CuboTarea {
  if (!t.fecha_limite) return "sin_fecha";
  if (t.fecha_limite < hoy) return "vencidas";
  if (t.fecha_limite === hoy) return "hoy";
  if (t.fecha_limite <= masDias(hoy, 7)) return "semana";
  return "despues";
}

// Una tarea vencida = pendiente con fecha límite pasada.
export function tareaVencida(t: Tarea, hoy: string = hoyISO()): boolean {
  return !tareaCompletada(t) && !!t.fecha_limite && t.fecha_limite < hoy;
}

const RANGO_PRIORIDAD: Record<string, number> = { alta: 0, normal: 1 };

// Ordena tareas pendientes: primero por fecha (las sin fecha al final), luego por
// prioridad (alta arriba), luego por antigüedad de captura.
function ordenarPendientes(a: Tarea, b: Tarea): number {
  const fa = a.fecha_limite ?? "9999-12-31";
  const fb = b.fecha_limite ?? "9999-12-31";
  if (fa !== fb) return fa.localeCompare(fb);
  const pa = RANGO_PRIORIDAD[a.prioridad] ?? 1;
  const pb = RANGO_PRIORIDAD[b.prioridad] ?? 1;
  if (pa !== pb) return pa - pb;
  return a.created_at.localeCompare(b.created_at);
}

export interface GrupoTareas {
  cubo: CuboTarea;
  etiqueta: string;
  tono: string;
  tareas: Tarea[];
}

// Agrupa las tareas PENDIENTES en los cubos de vencimiento (omite cubos vacíos).
export function agruparPendientes(tareas: Tarea[], hoy: string = hoyISO()): GrupoTareas[] {
  const pendientes = tareas.filter((t) => !tareaCompletada(t));
  return CUBOS.map((c) => ({
    cubo: c.valor,
    etiqueta: c.etiqueta,
    tono: c.tono,
    tareas: pendientes.filter((t) => cuboDeTarea(t, hoy) === c.valor).sort(ordenarPendientes),
  })).filter((g) => g.tareas.length > 0);
}

// ---------- Progreso de un proyecto ----------
export interface ProgresoProyecto {
  total: number;
  hechas: number;
  pendientes: number;
  vencidas: number;
  pct: number; // 0-100
}

export function progresoProyecto(tareas: Tarea[], hoy: string = hoyISO()): ProgresoProyecto {
  const total = tareas.length;
  const hechas = tareas.filter(tareaCompletada).length;
  const vencidas = tareas.filter((t) => tareaVencida(t, hoy)).length;
  return {
    total,
    hechas,
    pendientes: total - hechas,
    vencidas,
    pct: total === 0 ? 0 : Math.round((hechas / total) * 100),
  };
}

// Resumen para el hero del módulo.
export interface ResumenTareas {
  pendientes: number;
  vencidas: number;
  hoy: number;
  hechasSemana: number; // completadas en los últimos 7 días
}

export function resumenTareas(tareas: Tarea[], hoy: string = hoyISO()): ResumenTareas {
  const desde = masDias(hoy, -7);
  let pendientes = 0;
  let vencidas = 0;
  let hoyCnt = 0;
  let hechasSemana = 0;
  for (const t of tareas) {
    if (tareaCompletada(t)) {
      if ((t.completada_at ?? "").slice(0, 10) >= desde) hechasSemana++;
      continue;
    }
    pendientes++;
    const cubo = cuboDeTarea(t, hoy);
    if (cubo === "vencidas") vencidas++;
    else if (cubo === "hoy") hoyCnt++;
  }
  return { pendientes, vencidas, hoy: hoyCnt, hechasSemana };
}
