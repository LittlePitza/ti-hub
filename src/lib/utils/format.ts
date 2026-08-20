export function shortDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d.length <= 10 ? d + "T12:00:00" : d);
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Humanises a duration in milliseconds: "45 min", "2 h 15 min", "3 d 4 h".
export function duration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) {
    const m = min % 60;
    return m ? `${horas} h ${m} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  return h ? `${dias} d ${h} h` : `${dias} d`;
}

// The same duration, split into value/unit pairs so it can be rendered with a
// large number and a small unit tight against it (no monospace gaps between them).
export function durationParts(ms: number): { value: string; unit: string }[] {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const min = Math.floor(ms / 60000);
  if (min < 1) return [{ value: "<1", unit: "min" }];
  if (min < 60) return [{ value: String(min), unit: "min" }];
  const horas = Math.floor(min / 60);
  if (horas < 24) {
    const m = min % 60;
    const out = [{ value: String(horas), unit: "h" }];
    if (m) out.push({ value: String(m), unit: "min" });
    return out;
  }
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  const out = [{ value: String(dias), unit: "d" }];
  if (h) out.push({ value: String(h), unit: "h" });
  return out;
}

export function ticketFolio(n: number): string {
  return "TK-" + String(n).padStart(4, "0");
}

// Custody-letter folio: RES-<prefix>-#### (for example RES-LAP-0001).
export function custodyFolio(prefijo: string, n: number): string {
  return `RES-${prefijo}-${String(n).padStart(4, "0")}`;
}

// Internal invoice folio: FAC-#### (for example FAC-0042).
export function invoiceFolio(n: number): string {
  return "FAC-" + String(n).padStart(4, "0");
}

// Service-incident folio: INC-#### (for example INC-0007).
export function incidentFolio(n: number): string {
  return "INC-" + String(n).padStart(4, "0");
}

// Amount formatted for es-MX: currency(1234.5) -> "$1,234.50";
// currency(99, "USD") -> "USD 99.00" (es-MX resolves the USD symbol to the
// ISO code plus a non-breaking space, not to "US$").
// Note: Postgres `numeric` arrives as a string through supabase-js — wrap it in
// Number() first.
export function currency(n: number | null | undefined, divisa: "MXN" | "USD" = "MXN"): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: divisa }).format(n);
}
