// Invoices and vendors: statuses, recurrences and the payment schedule. The
// schema (supabase/schema.sql) is the source of truth for the allowed values;
// labels and business rules live here.
//
// The schedule does NOT materialise rows: each vendor's future due dates are
// projected at render time from its `proximo_pago` anchor and its
// `periodicidad`. The only materialisation happens when IT records the payment:
// the action creates the real invoice and advances the anchor with `addMonths()`.
//
// All date arithmetic works on YYYY-MM-DD strings in UTC so it does not depend
// on the server timezone.

import { currency } from "../utils/format";

export type InvoiceStatus = "pendiente" | "pagada" | "cancelada";
export type Recurrence = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | "unico";
export type Currency = "MXN" | "USD";

// Metadata for each persisted status. `tone` maps to `.insignia`.
export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; tone: string }[] = [
  { value: "pendiente", label: "Pendiente", tone: "aviso" },
  { value: "pagada", label: "Pagada", tone: "ok" },
  { value: "cancelada", label: "Cancelada", tone: "neutro" },
];

export const CURRENCIES: Currency[] = ["MXN", "USD"];

// `meses` is the projection step; 'unico' = 0 (a single occurrence).
export const RECURRENCES: { value: Recurrence; label: string; meses: number }[] = [
  { value: "mensual", label: "Mensual", meses: 1 },
  { value: "bimestral", label: "Bimestral", meses: 2 },
  { value: "trimestral", label: "Trimestral", meses: 3 },
  { value: "semestral", label: "Semestral", meses: 6 },
  { value: "anual", label: "Anual", meses: 12 },
  { value: "unico", label: "Pago único", meses: 0 },
];

export function recurrenceLabel(value: string): string {
  return RECURRENCES.find((p) => p.value === value)?.label ?? value;
}

// Today as YYYY-MM-DD in the plant timezone (Monterrey).
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
}

// The status shown in the UI: derives "Vencida" from pending + a past date.
// `vencida` deliberately does not exist in the database, so no process has to
// move statuses around.
export function visibleInvoiceStatus(
  f: { estado: string; fecha_vencimiento: string | null },
  hoy: string = todayISO(),
): { value: string; label: string; tone: string } {
  if (f.estado === "pendiente" && f.fecha_vencimiento && f.fecha_vencimiento < hoy) {
    return { value: "vencida", label: "Vencida", tone: "critico" };
  }
  const meta = INVOICE_STATUSES.find((e) => e.value === f.estado);
  return meta ?? { value: f.estado, label: f.estado, tone: "neutro" };
}

// Adds months to a YYYY-MM-DD date, respecting month ends:
// 2026-01-31 + 1 month = 2026-02-28 (clamped to the last day of the target month).
export function addMonths(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimoDia));
  return destino.toISOString().slice(0, 10);
}

export interface ScheduledVendor {
  id: string;
  nombre: string;
  servicio: string | null;
  costo: number | string | null; // numeric arrives as a string through supabase-js
  moneda: string;
  periodicidad: string;
  proximo_pago: string | null;
  activo: boolean;
}

export interface ScheduledInvoice {
  id: string;
  num: number;
  concepto: string;
  monto: number | string;
  moneda: string;
  estado: string;
  fecha_vencimiento: string;
  proveedor_id: string | null;
}

// One row of the payment schedule: either a captured invoice or the projection
// of a recurring vendor.
export interface DueItem {
  fecha: string; // YYYY-MM-DD
  origen: "factura" | "proveedor";
  refId: string;
  titulo: string;
  monto: number | null;
  moneda: Currency;
  vencido: boolean;
}

// Projects ONE vendor's due dates inside [from, to].
// If `proximo_pago` is in the past, that first occurrence comes out overdue (an
// anchor that never advanced = a payment never recorded). 'unico' emits a single
// date. Inactive or anchor-less => no projection.
export function projectVendorDues(p: ScheduledVendor, desde: string, hasta: string): DueItem[] {
  if (!p.activo || !p.proximo_pago) return [];
  const step = RECURRENCES.find((x) => x.value === p.periodicidad)?.meses ?? 1;
  const titulo = p.servicio ? `${p.nombre} · ${p.servicio}` : p.nombre;
  const monto = p.costo === null || p.costo === undefined ? null : Number(p.costo);
  const moneda: Currency = p.moneda === "USD" ? "USD" : "MXN";

  const out: DueItem[] = [];
  let fecha = p.proximo_pago;
  // The anchor may sit in the past: those occurrences are included as overdue
  // (an anchor that never advanced = payments never recorded).
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
    if (step === 0) break; // one-off payment: a single occurrence
    fecha = addMonths(fecha, step);
  }
  return out;
}

// Payment schedule: pending invoices plus projections for active vendors,
// sorted by date. Paid and cancelled invoices do not appear.
export function paymentSchedule(
  facturas: ScheduledInvoice[],
  proveedores: ScheduledVendor[],
  hoy: string = todayISO(),
  horizonteDias = 90,
): DueItem[] {
  const hasta = new Date(hoy + "T00:00:00Z");
  hasta.setUTCDate(hasta.getUTCDate() + horizonteDias);
  const limite = hasta.toISOString().slice(0, 10);

  const deFacturas: DueItem[] = facturas
    .filter((f) => f.estado === "pendiente" && f.fecha_vencimiento <= limite)
    .map((f) => ({
      fecha: f.fecha_vencimiento,
      origen: "factura" as const,
      refId: f.id,
      titulo: f.concepto,
      monto: Number(f.monto),
      moneda: (f.moneda === "USD" ? "USD" : "MXN") as Currency,
      vencido: f.fecha_vencimiento < hoy,
    }));

  const deProveedores = proveedores.flatMap((p) => projectVendorDues(p, hoy, limite));

  return [...deFacturas, ...deProveedores].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Groups the schedule for the agenda view: one block per month with its total.
export function groupByMonth(vs: DueItem[]): {
  clave: string; // "2026-07"
  label: string; // "Julio 2026"
  total: Record<Currency, number>;
  items: DueItem[];
}[] {
  const grupos = new Map<string, DueItem[]>();
  for (const v of vs) {
    const clave = v.fecha.slice(0, 7);
    const lista = grupos.get(clave) ?? [];
    lista.push(v);
    grupos.set(clave, lista);
  }
  return [...grupos.entries()].map(([clave, items]) => {
    const [a, m] = clave.split("-").map(Number);
    const label = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const total: Record<Currency, number> = { MXN: 0, USD: 0 };
    for (const v of items) if (v.monto !== null) total[v.moneda] += v.monto;
    return { clave, label: label[0].toUpperCase() + label.slice(1), total, items };
  });
}

// Renders a {MXN, USD} total, omitting a currency that is zero.
// A mixed total reads as "$1,200.00 + USD 99.00" under the es-MX locale.
export function formatTotals(total: Record<Currency, number>): string {
  const partes: string[] = [];
  if (total.MXN > 0 || total.USD === 0) partes.push(currency(total.MXN));
  if (total.USD > 0) partes.push(currency(total.USD, "USD"));
  return partes.join(" + ");
}

// Amount falling due within the current month (including what is already
// overdue from earlier months — it still has to be paid). Dashboard metric.
export function monthOutstanding(
  vs: DueItem[],
  hoy: string = todayISO(),
): Record<Currency, number> {
  const mes = hoy.slice(0, 7);
  const total: Record<Currency, number> = { MXN: 0, USD: 0 };
  for (const v of vs) {
    if (v.monto === null) continue;
    if (v.fecha.slice(0, 7) === mes || v.vencido) total[v.moneda] += v.monto;
  }
  return total;
}
