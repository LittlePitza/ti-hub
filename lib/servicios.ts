// Dominio del "Estado de sistemas": el catálogo de servicios que la empresa usa
// a diario (internet, Microsoft 365, SAP…) y los incidentes (caídas, fallas,
// mantenimientos) que se registran contra cada uno.
//
// El estado de un servicio NO se guarda: se DERIVA de sus incidentes abiertos,
// igual que `vencida` en facturas. Un servicio con un incidente `activo` de tipo
// `caida` está "Caído"; sin incidentes abiertos está "Operativo". Así ningún
// proceso tiene que mover estados a mano y la verdad vive en un solo lugar.
// El esquema (supabase/schema.sql) es la fuente de verdad de los valores permitidos.

export type CategoriaServicio = "conectividad" | "plataforma" | "infraestructura" | "otro";
export type CriticidadServicio = "critica" | "alta" | "normal";
export type TipoIncidente = "caida" | "degradado" | "mantenimiento";
export type EstadoIncidente = "activo" | "vigilando" | "resuelto";

export interface Servicio {
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

export interface Incidente {
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

// Categorías del catálogo, en el orden en que se agrupan en la UI.
export const CATEGORIAS_SERVICIO: { valor: CategoriaServicio; etiqueta: string }[] = [
  { valor: "conectividad", etiqueta: "Conectividad" },
  { valor: "plataforma", etiqueta: "Plataformas" },
  { valor: "infraestructura", etiqueta: "Infraestructura" },
  { valor: "otro", etiqueta: "Otros" },
];

export const CRITICIDADES: { valor: CriticidadServicio; etiqueta: string; tono: string }[] = [
  { valor: "critica", etiqueta: "Crítica", tono: "critico" },
  { valor: "alta", etiqueta: "Alta", tono: "aviso" },
  { valor: "normal", etiqueta: "Normal", tono: "neutro" },
];

// Tipos de incidente. `rango` ordena la severidad cuando un servicio acumula
// varios incidentes abiertos: gana el de rango más alto (ver estadoServicio).
export const TIPOS_INCIDENTE: {
  valor: TipoIncidente;
  etiqueta: string;
  tono: string;
  rango: number;
  // Cómo queda el servicio mientras este incidente sigue `activo`.
  estadoServicio: EstadoServicioValor;
}[] = [
  { valor: "caida", etiqueta: "Caída total", tono: "critico", rango: 3, estadoServicio: "caido" },
  { valor: "degradado", etiqueta: "Degradado", tono: "aviso", rango: 2, estadoServicio: "degradado" },
  { valor: "mantenimiento", etiqueta: "Mantenimiento", tono: "info", rango: 1, estadoServicio: "mantenimiento" },
];

export const ESTADOS_INCIDENTE: { valor: EstadoIncidente; etiqueta: string; tono: string }[] = [
  { valor: "activo", etiqueta: "Activo", tono: "critico" },
  { valor: "vigilando", etiqueta: "Vigilando", tono: "aviso" },
  { valor: "resuelto", etiqueta: "Resuelto", tono: "ok" },
];

// Un incidente sigue "abierto" (afecta al servicio) mientras no esté resuelto.
export function incidenteAbierto(i: { estado: string }): boolean {
  return i.estado !== "resuelto";
}

export function metaTipoIncidente(valor: string) {
  return TIPOS_INCIDENTE.find((t) => t.valor === valor) ?? TIPOS_INCIDENTE[0];
}

export function metaEstadoIncidente(valor: string) {
  return ESTADOS_INCIDENTE.find((e) => e.valor === valor) ?? ESTADOS_INCIDENTE[0];
}

export function etiquetaCriticidad(valor: string): string {
  return CRITICIDADES.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

// ---------- Estado derivado del servicio ----------
export type EstadoServicioValor = "operativo" | "mantenimiento" | "degradado" | "vigilando" | "caido";

export interface EstadoServicio {
  valor: EstadoServicioValor;
  etiqueta: string;
  tono: string; // mapea a `.insignia` y a los tonos del punto de estado
  rango: number; // 0 = operativo … 4 = caído; para ordenar peor-primero
}

const ESTADO_META: Record<EstadoServicioValor, Omit<EstadoServicio, "valor">> = {
  operativo:     { etiqueta: "Operativo",     tono: "ok",      rango: 0 },
  mantenimiento: { etiqueta: "Mantenimiento", tono: "info",    rango: 1 },
  vigilando:     { etiqueta: "Vigilando",     tono: "aviso",   rango: 2 },
  degradado:     { etiqueta: "Degradado",     tono: "aviso",   rango: 3 },
  caido:         { etiqueta: "Caído",         tono: "critico", rango: 4 },
};

export function metaEstadoServicio(valor: EstadoServicioValor): EstadoServicio {
  return { valor, ...ESTADO_META[valor] };
}

// Deriva el estado de un servicio a partir de SUS incidentes abiertos.
// - Sin incidentes abiertos => Operativo.
// - Con incidentes `activo`: gana el tipo de mayor rango (caída > degradado > mant.).
// - Solo `vigilando` (ya sin activos): el servicio está bajo observación.
export function estadoServicio(incidentesDelServicio: Incidente[]): EstadoServicio {
  const abiertos = incidentesDelServicio.filter(incidenteAbierto);
  if (abiertos.length === 0) return metaEstadoServicio("operativo");

  const activos = abiertos.filter((i) => i.estado === "activo");
  if (activos.length > 0) {
    const peor = activos.reduce((a, b) =>
      metaTipoIncidente(b.tipo).rango > metaTipoIncidente(a.tipo).rango ? b : a,
    );
    return metaEstadoServicio(metaTipoIncidente(peor.tipo).estadoServicio);
  }
  // Solo quedan incidentes en "vigilando".
  return metaEstadoServicio("vigilando");
}

// Duración de un incidente en ms: fin (si resuelto) o ahora, menos inicio.
export function duracionIncidente(i: { inicio: string; fin: string | null }, ahora: number = Date.now()): number {
  const fin = i.fin ? new Date(i.fin).getTime() : ahora;
  return Math.max(0, fin - new Date(i.inicio).getTime());
}

export interface ServicioConEstado {
  servicio: Servicio;
  estado: EstadoServicio;
  incidentesAbiertos: Incidente[];
}

// Une servicios con sus incidentes y calcula el estado de cada uno. Ordena por
// severidad (lo caído primero) y, a igualdad, por el `orden` del catálogo.
export function serviciosConEstado(servicios: Servicio[], incidentes: Incidente[]): ServicioConEstado[] {
  const porServicio = new Map<string, Incidente[]>();
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
        estado: estadoServicio(propios),
        incidentesAbiertos: propios
          .filter(incidenteAbierto)
          .sort((a, b) => b.inicio.localeCompare(a.inicio)),
      };
    })
    .sort((a, b) => b.estado.rango - a.estado.rango || a.servicio.orden - b.servicio.orden);
}

// Resumen para el hero del tablero y el aviso del portal.
export interface ResumenServicios {
  total: number;
  operativos: number;
  afectados: number; // con algún incidente abierto
  caidos: number;
  todoBien: boolean;
}

export function resumenServicios(conEstado: ServicioConEstado[]): ResumenServicios {
  const afectados = conEstado.filter((s) => s.estado.valor !== "operativo").length;
  const caidos = conEstado.filter((s) => s.estado.valor === "caido").length;
  return {
    total: conEstado.length,
    operativos: conEstado.length - afectados,
    afectados,
    caidos,
    todoBien: afectados === 0,
  };
}
