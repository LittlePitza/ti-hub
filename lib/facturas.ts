// Dominio de facturas y proveedores: estados, periodicidades y el calendario de
// pagos. El esquema (supabase/schema.sql) es la fuente de verdad de los valores
// permitidos; aquí viven etiquetas y reglas de negocio.
//
// El calendario NO materializa filas: los vencimientos futuros de cada proveedor
// se proyectan al renderizar a partir de su ancla `proximo_pago` y su
// `periodicidad`. La única "materialización" ocurre cuando TI registra el pago:
// la action crea la factura real y avanza el ancla con `sumarMeses()`.
//
// Toda la aritmética de fechas trabaja sobre strings YYYY-MM-DD en UTC para no
// depender de la zona horaria del servidor.

import { moneda } from "./format";

export type EstadoFactura = "pendiente" | "pagada" | "cancelada";
export type Periodicidad = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | "unico";
export type Moneda = "MXN" | "USD";

// Metadatos de cada estado persistido. `tono` mapea a `.insignia`.
export const ESTADOS_FACTURA: { valor: EstadoFactura; etiqueta: string; tono: string }[] = [
  { valor: "pendiente", etiqueta: "Pendiente", tono: "aviso" },
  { valor: "pagada", etiqueta: "Pagada", tono: "ok" },
  { valor: "cancelada", etiqueta: "Cancelada", tono: "neutro" },
];

export const MONEDAS: Moneda[] = ["MXN", "USD"];

// `meses` es el paso de la proyección; 'unico' = 0 (una sola ocurrencia).
export const PERIODICIDADES: { valor: Periodicidad; etiqueta: string; meses: number }[] = [
  { valor: "mensual", etiqueta: "Mensual", meses: 1 },
  { valor: "bimestral", etiqueta: "Bimestral", meses: 2 },
  { valor: "trimestral", etiqueta: "Trimestral", meses: 3 },
  { valor: "semestral", etiqueta: "Semestral", meses: 6 },
  { valor: "anual", etiqueta: "Anual", meses: 12 },
  { valor: "unico", etiqueta: "Pago único", meses: 0 },
];

export function etiquetaPeriodicidad(valor: string): string {
  return PERIODICIDADES.find((p) => p.valor === valor)?.etiqueta ?? valor;
}

// Fecha de hoy como YYYY-MM-DD en la zona horaria de la planta (Monterrey).
export function hoyISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
}

// Estado que se muestra en la UI: deriva "Vencida" de pendiente + fecha pasada.
// `vencida` no existe en la BD a propósito: así ningún proceso mueve estados.
export function estadoVisible(
  f: { estado: string; fecha_vencimiento: string | null },
  hoy: string = hoyISO(),
): { valor: string; etiqueta: string; tono: string } {
  if (f.estado === "pendiente" && f.fecha_vencimiento && f.fecha_vencimiento < hoy) {
    return { valor: "vencida", etiqueta: "Vencida", tono: "critico" };
  }
  const meta = ESTADOS_FACTURA.find((e) => e.valor === f.estado);
  return meta ?? { valor: f.estado, etiqueta: f.estado, tono: "neutro" };
}

// Suma meses a una fecha YYYY-MM-DD respetando el fin de mes:
// 2026-01-31 + 1 mes = 2026-02-28 (clamp al último día del mes destino).
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimoDia));
  return destino.toISOString().slice(0, 10);
}

export interface ProveedorCalendario {
  id: string;
  nombre: string;
  servicio: string | null;
  costo: number | string | null; // numeric llega como string vía supabase-js
  moneda: string;
  periodicidad: string;
  proximo_pago: string | null;
  activo: boolean;
}

export interface FacturaCalendario {
  id: string;
  num: number;
  concepto: string;
  monto: number | string;
  moneda: string;
  estado: string;
  fecha_vencimiento: string;
  proveedor_id: string | null;
}

// Un renglón del calendario de pagos: una factura capturada o la proyección
// de un proveedor recurrente.
export interface Vencimiento {
  fecha: string; // YYYY-MM-DD
  origen: "factura" | "proveedor";
  refId: string;
  titulo: string;
  monto: number | null;
  moneda: Moneda;
  vencido: boolean;
}

// Proyecta los vencimientos de UN proveedor dentro de [desde, hasta].
// Si `proximo_pago` quedó en el pasado, esa primera ocurrencia sale vencida
// (ancla sin avanzar = pago sin registrar). 'unico' emite una sola fecha.
// Inactivo o sin ancla => sin proyección.
export function proyectarProveedor(
  p: ProveedorCalendario,
  desde: string,
  hasta: string,
): Vencimiento[] {
  if (!p.activo || !p.proximo_pago) return [];
  const paso = PERIODICIDADES.find((x) => x.valor === p.periodicidad)?.meses ?? 1;
  const titulo = p.servicio ? `${p.nombre} · ${p.servicio}` : p.nombre;
  const monto = p.costo === null || p.costo === undefined ? null : Number(p.costo);
  const moneda: Moneda = p.moneda === "USD" ? "USD" : "MXN";

  const out: Vencimiento[] = [];
  let fecha = p.proximo_pago;
  // El ancla puede venir del pasado: esas ocurrencias se incluyen como vencidas
  // (ancla sin avanzar = pagos sin registrar).
  while (fecha <= hasta) {
    out.push({
      fecha,
      origen: "proveedor",
      refId: p.id,
      titulo,
      monto,
      moneda,
      vencido: fecha < desde,
    });
    if (paso === 0) break; // pago único: una sola ocurrencia
    fecha = sumarMeses(fecha, paso);
  }
  return out;
}

// Calendario de pagos: facturas pendientes + proyecciones de proveedores
// activos, ordenado por fecha. Las pagadas/canceladas no aparecen.
export function calendarioPagos(
  facturas: FacturaCalendario[],
  proveedores: ProveedorCalendario[],
  hoy: string = hoyISO(),
  horizonteDias = 90,
): Vencimiento[] {
  const hasta = new Date(hoy + "T00:00:00Z");
  hasta.setUTCDate(hasta.getUTCDate() + horizonteDias);
  const limite = hasta.toISOString().slice(0, 10);

  const deFacturas: Vencimiento[] = facturas
    .filter((f) => f.estado === "pendiente" && f.fecha_vencimiento <= limite)
    .map((f) => ({
      fecha: f.fecha_vencimiento,
      origen: "factura" as const,
      refId: f.id,
      titulo: f.concepto,
      monto: Number(f.monto),
      moneda: (f.moneda === "USD" ? "USD" : "MXN") as Moneda,
      vencido: f.fecha_vencimiento < hoy,
    }));

  const deProveedores = proveedores.flatMap((p) => proyectarProveedor(p, hoy, limite));

  return [...deFacturas, ...deProveedores].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Agrupa el calendario para la vista de agenda: un bloque por mes con su total.
export function agruparPorMes(vs: Vencimiento[]): {
  clave: string; // "2026-07"
  etiqueta: string; // "Julio 2026"
  total: Record<Moneda, number>;
  items: Vencimiento[];
}[] {
  const grupos = new Map<string, Vencimiento[]>();
  for (const v of vs) {
    const clave = v.fecha.slice(0, 7);
    const lista = grupos.get(clave) ?? [];
    lista.push(v);
    grupos.set(clave, lista);
  }
  return [...grupos.entries()].map(([clave, items]) => {
    const [a, m] = clave.split("-").map(Number);
    const etiqueta = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const total: Record<Moneda, number> = { MXN: 0, USD: 0 };
    for (const v of items) if (v.monto !== null) total[v.moneda] += v.monto;
    return { clave, etiqueta: etiqueta[0].toUpperCase() + etiqueta.slice(1), total, items };
  });
}

// Pinta un total {MXN, USD} omitiendo la divisa en cero: "$1,200.00 + US$99.00".
export function montos(total: Record<Moneda, number>): string {
  const partes: string[] = [];
  if (total.MXN > 0 || total.USD === 0) partes.push(moneda(total.MXN));
  if (total.USD > 0) partes.push(moneda(total.USD, "USD"));
  return partes.join(" + ");
}

// Monto que vence dentro del mes en curso (incluye lo ya vencido de meses
// anteriores: sigue pendiente de pagar). Métrica del dashboard.
export function pendienteDelMes(vs: Vencimiento[], hoy: string = hoyISO()): Record<Moneda, number> {
  const mes = hoy.slice(0, 7);
  const total: Record<Moneda, number> = { MXN: 0, USD: 0 };
  for (const v of vs) {
    if (v.monto === null) continue;
    if (v.fecha.slice(0, 7) === mes || v.vencido) total[v.moneda] += v.monto;
  }
  return total;
}
