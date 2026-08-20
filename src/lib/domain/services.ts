// Systems status: the catalogue of services the company uses daily (internet,
// Microsoft 365, SAP…) and the incidents (outages, degradations, maintenance)
// recorded against each of them.
//
// A service status is NOT stored: it is DERIVED from its open incidents, the
// same way `vencida` works for invoices. A service with an `activo` incident of
// type `caida` is down; with no open incidents it is operational. That way no
// process has to move statuses by hand and the truth lives in one place.
// The schema (supabase/schema.sql) is the source of truth for allowed values.

export type ServiceCategory = "conectividad" | "plataforma" | "infraestructura" | "otro";
export type ServiceCriticality = "critica" | "alta" | "normal";
export type IncidentType = "caida" | "degradado" | "mantenimiento";
export type IncidentStatus = "activo" | "vigilando" | "resuelto";

export interface Service {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  proveedor: string | null;
  criticidad: string;
  visible_portal: boolean;
  orden: number;
  activo: boolean;
  created_at: string;
}

export interface Incident {
  id: string;
  num: number;
  servicio_id: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  estado: string;
  inicio: string;
  fin: string | null;
  resolucion: string | null;
  created_at: string;
}

// Catalogue categories, in the order the UI groups them.
export const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "conectividad", label: "Conectividad" },
  { value: "plataforma", label: "Plataformas" },
  { value: "infraestructura", label: "Infraestructura" },
  { value: "otro", label: "Otros" },
];

export const CRITICALITIES: { value: ServiceCriticality; label: string; tone: string }[] = [
  { value: "critica", label: "Crítica", tone: "critico" },
  { value: "alta", label: "Alta", tone: "aviso" },
  { value: "normal", label: "Normal", tone: "neutro" },
];

// Incident types. `rango` ranks severity when a service has several open
// incidents at once: the highest rank wins (see serviceStatus).
export const INCIDENT_TYPES: {
  value: IncidentType;
  label: string;
  tone: string;
  rango: number;
  // How the service reads while this incident is still `activo`.
  serviceStatus: ServiceStatusValue;
}[] = [
  { value: "caida", label: "Caída total", tone: "critico", rango: 3, serviceStatus: "caido" },
  {
    value: "degradado",
    label: "Degradado",
    tone: "aviso",
    rango: 2,
    serviceStatus: "degradado",
  },
  {
    value: "mantenimiento",
    label: "Mantenimiento",
    tone: "info",
    rango: 1,
    serviceStatus: "mantenimiento",
  },
];

export const INCIDENT_STATUSES: { value: IncidentStatus; label: string; tone: string }[] = [
  { value: "activo", label: "Activo", tone: "critico" },
  { value: "vigilando", label: "Vigilando", tone: "aviso" },
  { value: "resuelto", label: "Resuelto", tone: "ok" },
];

// An incident stays open (and affects the service) until it is resolved.
export function isIncidentOpen(i: { estado: string }): boolean {
  return i.estado !== "resuelto";
}

export function incidentTypeMeta(value: string) {
  return INCIDENT_TYPES.find((t) => t.value === value) ?? INCIDENT_TYPES[0];
}

export function incidentStatusMeta(value: string) {
  return INCIDENT_STATUSES.find((e) => e.value === value) ?? INCIDENT_STATUSES[0];
}

export function criticalityLabel(value: string): string {
  return CRITICALITIES.find((c) => c.value === value)?.label ?? value;
}

// ---------- Derived service status ----------
export type ServiceStatusValue =
  "operativo" | "mantenimiento" | "degradado" | "vigilando" | "caido";

export interface ServiceStatus {
  value: ServiceStatusValue;
  label: string;
  tone: string; // maps to `.insignia` and to the status-dot tones
  rango: number; // 0 = operational … 4 = down; used to sort worst-first
}

const ESTADO_META: Record<ServiceStatusValue, Omit<ServiceStatus, "value">> = {
  operativo: { label: "Operativo", tone: "ok", rango: 0 },
  mantenimiento: { label: "Mantenimiento", tone: "info", rango: 1 },
  vigilando: { label: "Vigilando", tone: "aviso", rango: 2 },
  degradado: { label: "Degradado", tone: "aviso", rango: 3 },
  caido: { label: "Caído", tone: "critico", rango: 4 },
};

export function serviceStatusMeta(value: ServiceStatusValue): ServiceStatus {
  return { value, ...ESTADO_META[value] };
}

// Derives a service status from ITS open incidents.
// - No open incidents => operational.
// - With `activo` incidents: the highest-ranked type wins
//   (outage > degraded > maintenance).
// - Only `vigilando` left (no active ones): the service is being watched.
export function serviceStatus(incidentesDelServicio: Incident[]): ServiceStatus {
  const abiertos = incidentesDelServicio.filter(isIncidentOpen);
  if (abiertos.length === 0) return serviceStatusMeta("operativo");

  const activos = abiertos.filter((i) => i.estado === "activo");
  if (activos.length > 0) {
    const peor = activos.reduce((a, b) =>
      incidentTypeMeta(b.tipo).rango > incidentTypeMeta(a.tipo).rango ? b : a,
    );
    return serviceStatusMeta(incidentTypeMeta(peor.tipo).serviceStatus);
  }
  // Only `vigilando` incidents remain.
  return serviceStatusMeta("vigilando");
}

// Incident duration in ms: end (if resolved) or now, minus start.
export function incidentDuration(
  i: { inicio: string; fin: string | null },
  ahora: number = Date.now(),
): number {
  const fin = i.fin ? new Date(i.fin).getTime() : ahora;
  return Math.max(0, fin - new Date(i.inicio).getTime());
}

export interface ServiceWithStatus {
  servicio: Service;
  estado: ServiceStatus;
  incidentesAbiertos: Incident[];
}

// Joins services with their incidents and computes each status. Sorts by
// severity (what is down comes first) and, on ties, by the catalogue `orden`.
export function servicesWithStatus(
  servicios: Service[],
  incidentes: Incident[],
): ServiceWithStatus[] {
  const porServicio = new Map<string, Incident[]>();
  for (const i of incidentes) {
    const lista = porServicio.get(i.servicio_id) ?? [];
    lista.push(i);
    porServicio.set(i.servicio_id, lista);
  }
  return servicios
    .map((servicio) => {
      const propios = porServicio.get(servicio.id) ?? [];
      return {
        servicio,
        estado: serviceStatus(propios),
        incidentesAbiertos: propios
          .filter(isIncidentOpen)
          .sort((a, b) => b.inicio.localeCompare(a.inicio)),
      };
    })
    .sort((a, b) => b.estado.rango - a.estado.rango || a.servicio.orden - b.servicio.orden);
}

// Summary for the board hero and the portal outage notice.
export interface ServicesSummary {
  total: number;
  operativos: number;
  afectados: number; // with at least one open incident
  caidos: number;
  todoBien: boolean;
}

export function servicesSummary(conEstado: ServiceWithStatus[]): ServicesSummary {
  const afectados = conEstado.filter((s) => s.estado.value !== "operativo").length;
  const caidos = conEstado.filter((s) => s.estado.value === "caido").length;
  return {
    total: conEstado.length,
    operativos: conEstado.length - afectados,
    afectados,
    caidos,
    todoBien: afectados === 0,
  };
}
