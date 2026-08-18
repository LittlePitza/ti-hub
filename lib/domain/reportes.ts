// Dominio de reportes mensuales: el corte de mes que TI presenta como KPIs.
// Todo se DERIVA de las tablas existentes (tickets, incidentes, mantenimientos):
// no hay tablas nuevas ni snapshots — el reporte de un mes pasado siempre se
// puede reconstruir porque los sellos de tiempo (created_at, primera_respuesta_at,
// resuelto_at, inicio/fin) son inmutables una vez ocurridos.
//
// Convención de cohortes (estándar de mesa de ayuda):
//   - "creados"   = tickets con created_at dentro del mes.
//   - "atendidos" = tickets cuya PRIMERA RESPUESTA cayó en el mes (aunque se
//                   hayan creado antes); sobre ellos se mide el SLA de respuesta.
//   - "resueltos" = tickets cuyo resuelto_at cayó en el mes; sobre ellos se mide
//                   el SLA de resolución. Así el mes califica el trabajo hecho
//                   en el mes, no el destino de lo que entró.
//   - "backlog"   = tickets creados antes del cierre y aún sin resolver al cierre
//                   (para el mes en curso, el cierre es "ahora").

import {
  evaluarRespuesta,
  evaluarResolucion,
  SLA_DEFAULTS,
  SLA_POR_VENCER_PCT_DEFAULT,
  type SlaTabla,
} from "./tickets";

// ---------- Meses (clave "YYYY-MM") ----------

export function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function esClaveMes(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

// Límites del mes en ms de época, en hora local del servidor: [inicio, fin).
export function rangoMes(clave: string): { inicio: number; fin: number } {
  const [anio, mes] = clave.split("-").map(Number);
  return {
    inicio: new Date(anio, mes - 1, 1).getTime(),
    fin: new Date(anio, mes, 1).getTime(),
  };
}

// Mes vecino: mesVecino("2026-01", -1) -> "2025-12".
export function mesVecino(clave: string, delta: number): string {
  const [anio, mes] = clave.split("-").map(Number);
  return claveMes(new Date(anio, mes - 1 + delta, 1));
}

// Últimos n meses terminando en `clave`, en orden cronológico.
export function ultimosMeses(clave: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => mesVecino(clave, i - (n - 1)));
}

// "2026-07" -> "Julio 2026" (para el selector y el título del reporte).
export function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  const nombre = new Date(anio, mes - 1, 1).toLocaleDateString("es-MX", { month: "long" });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

// "2026-07" -> "jul" (etiquetas compactas de la gráfica de tendencia).
export function etiquetaMesCorta(clave: string): string {
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

export interface TicketReporte {
  estado: string;
  prioridad: string;
  categoria: string;
  created_at: string;
  primera_respuesta_at: string | null;
  resuelto_at: string | null;
}

export interface ReporteTickets {
  creados: number;
  resueltos: number;
  backlogCierre: number;
  porCategoria: Record<string, number>; // de los creados en el mes
  porPrioridad: Record<string, number>; // de los creados en el mes
  respuesta: { atendidos: number; enSla: number; pct: number | null; promedioMs: number | null };
  resolucion: { enSla: number; pct: number | null; promedioMs: number | null };
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function reporteTickets(
  tickets: TicketReporte[],
  clave: string,
  sla: SlaTabla = SLA_DEFAULTS,
  porVencerPct: number = SLA_POR_VENCER_PCT_DEFAULT,
  ahora: number = Date.now(),
): ReporteTickets {
  const r = rangoMes(clave);
  const cierre = Math.min(r.fin, ahora); // mes en curso: el corte es "ahora"

  const creados = tickets.filter((t) => dentro(t.created_at, r));
  const porCategoria: Record<string, number> = {};
  const porPrioridad: Record<string, number> = {};
  for (const t of creados) {
    porCategoria[t.categoria] = (porCategoria[t.categoria] ?? 0) + 1;
    porPrioridad[t.prioridad] = (porPrioridad[t.prioridad] ?? 0) + 1;
  }

  // SLA de respuesta: cohorte de atendidos en el mes. Como primera_respuesta_at ya
  // está sellado, evaluarRespuesta es determinista (no depende de "ahora").
  const atendidos = tickets.filter((t) => dentro(t.primera_respuesta_at, r));
  const evalRespuesta = atendidos.map((t) => evaluarRespuesta(t, ahora, sla, porVencerPct));
  const respuestaEnSla = evalRespuesta.filter((e) => e.semaforo === "cumplido").length;

  // SLA de resolución: cohorte de resueltos en el mes (resuelto_at sellado).
  const resueltos = tickets.filter((t) => dentro(t.resuelto_at, r));
  const evalResolucion = resueltos.map((t) => evaluarResolucion(t, ahora, sla, porVencerPct));
  const resolucionEnSla = evalResolucion.filter((e) => e.semaforo === "cumplido").length;

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

// Serie mensual creados vs resueltos, para la gráfica de tendencia.
export interface PuntoSerie {
  clave: string;
  creados: number;
  resueltos: number;
}

export function serieMensual(tickets: TicketReporte[], claves: string[]): PuntoSerie[] {
  return claves.map((clave) => {
    const r = rangoMes(clave);
    return {
      clave,
      creados: tickets.filter((t) => dentro(t.created_at, r)).length,
      resueltos: tickets.filter((t) => dentro(t.resuelto_at, r)).length,
    };
  });
}

// ---------- Incidentes (estado de sistemas) ----------

export interface IncidenteReporte {
  servicio_id: string;
  tipo: string;
  estado: string;
  inicio: string;
  fin: string | null;
}

// Lo que la tabla de detalle necesita además de lo básico (folio y título).
export interface IncidenteDetalle extends IncidenteReporte {
  num: number;
  titulo: string;
}

export interface AfectacionServicio {
  servicioId: string;
  nombre: string;
  criticidad: string;
  incidentes: number; // incidentes que tocaron el mes
  msCaida: number; // solape de incidentes tipo `caida` con el mes
  msAfectado: number; // solape de caídas + degradados (mantenimiento no cuenta)
  disponibilidad: number; // % del mes transcurrido sin caída total
}

// Tiempo operativo del mes por servicio, sobre TODO el catálogo (un servicio
// sin incidentes reporta el 100% de la ventana). Es el corte que se entrega
// aparte como KPI de disponibilidad.
export interface DisponibilidadServicio {
  servicioId: string;
  nombre: string;
  criticidad: string;
  msCaida: number; // caída total que pisó el mes
  msOperativo: number; // ventana transcurrida menos caída
  disponibilidad: number; // % del tramo transcurrido sin caída total
}

export interface ReporteIncidentes {
  iniciados: number; // incidentes que arrancaron en el mes
  resueltos: number; // incidentes cerrados en el mes
  abiertosCierre: number; // seguían abiertos al corte
  msCaidaTotal: number;
  msVentana: number; // tramo del mes transcurrido al corte (el 100% de referencia)
  mttrMs: number | null; // duración promedio de los incidentes cerrados en el mes
  disponibilidadPromedio: number | null; // promedio del catálogo completo (sin afectación = 100)
  porTipo: Record<string, number>; // incidentes que tocaron el mes, por tipo
  porServicio: AfectacionServicio[]; // solo servicios afectados, peor primero
  disponibilidadPorServicio: DisponibilidadServicio[]; // catálogo completo, peor primero
}

// Milisegundos que un incidente pisa dentro de la ventana [inicio, corte).
// Un incidente sin `fin` sigue abierto: cuenta hasta el corte.
function solape(i: IncidenteReporte, inicioVentana: number, corte: number): number {
  const desde = Math.max(new Date(i.inicio).getTime(), inicioVentana);
  const hasta = Math.min(i.fin ? new Date(i.fin).getTime() : corte, corte);
  return Math.max(0, hasta - desde);
}

export function reporteIncidentes(
  incidentes: IncidenteReporte[],
  servicios: { id: string; nombre: string; criticidad: string }[],
  clave: string,
  ahora: number = Date.now(),
): ReporteIncidentes {
  const r = rangoMes(clave);
  const corte = Math.min(r.fin, ahora);
  const ventanaMs = Math.max(1, corte - r.inicio); // evita dividir entre 0 el día 1

  const iniciados = incidentes.filter((i) => dentro(i.inicio, r)).length;
  const cerradosEnMes = incidentes.filter((i) => dentro(i.fin, r));
  const abiertosCierre = incidentes.filter((i) => {
    const inicio = new Date(i.inicio).getTime();
    if (inicio >= corte) return false;
    return !i.fin || new Date(i.fin).getTime() >= corte;
  }).length;

  // MTTR sobre la cohorte de cerrados en el mes: duración completa del incidente
  // (aunque haya arrancado en un mes anterior), igual que la resolución de tickets.
  const mttrMs = promedio(
    cerradosEnMes.map((i) =>
      Math.max(0, new Date(i.fin!).getTime() - new Date(i.inicio).getTime()),
    ),
  );

  // Distribución por tipo de todo incidente que pisó el mes (no solo los iniciados).
  const porTipo: Record<string, number> = {};
  for (const i of incidentes) {
    if (solape(i, r.inicio, corte) <= 0) continue;
    porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1;
  }

  const porServicio: AfectacionServicio[] = [];
  const disponibilidadPorServicio: DisponibilidadServicio[] = [];
  let msCaidaTotal = 0;
  let sumaDisponibilidad = 0;

  for (const s of servicios) {
    const propios = incidentes.filter((i) => i.servicio_id === s.id);
    let msCaida = 0;
    let msAfectado = 0;
    let cuantos = 0;
    for (const i of propios) {
      const ms = solape(i, r.inicio, corte);
      if (ms <= 0) continue;
      cuantos++;
      if (i.tipo === "caida") msCaida += ms;
      if (i.tipo === "caida" || i.tipo === "degradado") msAfectado += ms;
    }
    // Disponibilidad = % del tramo transcurrido del mes sin caída total.
    // Se calcula sobre lo transcurrido (no el mes completo) para que el mes
    // en curso no se vea artificialmente mejor.
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
    // Promedio sobre TODO el catálogo monitoreado: los servicios sin caída
    // aportan 100, para que el KPI refleje la salud del conjunto y no solo
    // de los afectados.
    disponibilidadPromedio: servicios.length ? sumaDisponibilidad / servicios.length : null,
    porTipo,
    porServicio,
    disponibilidadPorServicio,
  };
}

// Serie mensual de incidentes para la tendencia: `creados` = iniciados en el
// mes, `resueltos` = cerrados en el mes (misma forma que la serie de tickets).
export function serieMensualIncidentes(
  incidentes: IncidenteReporte[],
  claves: string[],
): PuntoSerie[] {
  return claves.map((clave) => {
    const r = rangoMes(clave);
    return {
      clave,
      creados: incidentes.filter((i) => dentro(i.inicio, r)).length,
      resueltos: incidentes.filter((i) => dentro(i.fin, r)).length,
    };
  });
}

// Incidentes que pisaron el mes, con su duración total y si siguen abiertos,
// del más reciente al más viejo (tabla de detalle del reporte).
export function incidentesDelMes<T extends IncidenteReporte>(
  incidentes: T[],
  clave: string,
  ahora: number = Date.now(),
): (T & { msDuracion: number; abierto: boolean })[] {
  const r = rangoMes(clave);
  const corte = Math.min(r.fin, ahora);
  return incidentes
    .filter((i) => solape(i, r.inicio, corte) > 0)
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

// Tono de insignia para una disponibilidad mensual (mesa interna: 99.5% de un
// mes ≈ 3.6 h caídas — ya es para prender focos).
export function tonoDisponibilidad(pct: number): string {
  if (pct >= 99.9) return "ok";
  if (pct >= 99) return "aviso";
  return "critico";
}

// ---------- Mantenimientos ----------

export interface MantenimientoReporte {
  tipo: string;
  estado: string;
  fecha_programada: string; // date "YYYY-MM-DD"
}

export interface ReporteMantenimientos {
  programados: number; // con fecha en el mes
  completados: number;
  cancelados: number;
  pendientes: number; // programado / en_proceso con fecha en el mes
  preventivos: number;
  correctivos: number;
  cumplimientoPct: number | null; // completados / (programados − cancelados)
}

export function reporteMantenimientos(
  mantos: MantenimientoReporte[],
  clave: string,
): ReporteMantenimientos {
  // fecha_programada es `date`: basta comparar el prefijo "YYYY-MM".
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

// ---------- Comparación contra el mes anterior ----------

// Variación porcentual (null si no hay base de comparación).
export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
