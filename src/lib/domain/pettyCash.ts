// Petty cash: the department's fixed cash float.
// The limit (the size of the float) lives in config_correo.caja_limite — the
// panel's single configuration row — and the entries in `caja_movimientos`.
//
// The model is an imprest ledger: the float starts full at its limit, every
// purchase drains it and every reimbursement refills it. Nothing is marked as
// "reimbursed" row by row — the balance is pure ledger arithmetic:
// balance = limit − purchases + reimbursements. This is not a tax record (that
// lives in SAP), only internal control and bookkeeping.

export type EntryType = "compra" | "reembolso";

export interface PettyCashEntry {
  id: string;
  tipo: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  monto: number | string; // numeric arrives as a string through supabase-js
  comprador: string | null;
  notas: string | null;
  created_at: string;
}

export interface PettyCashSummary {
  limite: number | null; // null = not configured
  gastado: number; // running total of purchases
  reembolsado: number; // running total of reimbursements
  saldo: number; // limit - spent + reimbursed (0 when there is no limit)
  porReembolsar: number; // what is missing to reach the limit again (the button suggestion)
  ultimoReembolso: PettyCashEntry | null;
  gastadoDesdeReembolso: number; // purchases made after the last reimbursement
}

// Postgres `numeric` arrives as a string; convert to a number safely.
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function pettyCashSummary(
  movimientos: PettyCashEntry[],
  limite: number | string | null,
): PettyCashSummary {
  const lim = limite === null || limite === undefined ? null : num(limite);
  let gastado = 0;
  let reembolsado = 0;
  for (const m of movimientos) {
    if (m.tipo === "compra") gastado += num(m.monto);
    else if (m.tipo === "reembolso") reembolsado += num(m.monto);
  }

  // The most recent reimbursement by date (created_at breaks ties on the same day).
  const reembolsos = movimientos
    .filter((m) => m.tipo === "reembolso")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  const ultimoReembolso = reembolsos[reembolsos.length - 1] ?? null;

  const gastadoDesdeReembolso = movimientos
    .filter(
      (m) =>
        m.tipo === "compra" &&
        (!ultimoReembolso ||
          m.fecha.localeCompare(ultimoReembolso.fecha) > 0 ||
          (m.fecha === ultimoReembolso.fecha && m.created_at > ultimoReembolso.created_at)),
    )
    .reduce((acc, m) => acc + num(m.monto), 0);

  const saldo = lim === null ? 0 : lim - gastado + reembolsado;
  return {
    limite: lim,
    gastado,
    reembolsado,
    saldo,
    porReembolsar: lim === null ? 0 : Math.max(0, lim - saldo),
    ultimoReembolso,
    gastadoDesdeReembolso,
  };
}

// Float level (0-1) for the bar; the tone warns when the box is running dry.
export function pettyCashLevel(r: PettyCashSummary): {
  pct: number;
  tone: "ok" | "aviso" | "critico";
} {
  if (r.limite === null || r.limite <= 0) return { pct: 0, tone: "ok" };
  const pct = Math.max(0, Math.min(1, r.saldo / r.limite));
  return { pct, tone: pct < 0.15 ? "critico" : pct < 0.4 ? "aviso" : "ok" };
}
