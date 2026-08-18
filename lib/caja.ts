// Dominio de la caja chica: el fondo fijo del departamento en efectivo.
// El límite (monto del fondo) vive en config_correo.caja_limite — la fila
// única de configuración del panel — y los movimientos en `caja_movimientos`.
//
// El modelo es una bitácora de fondo fijo (imprest): la caja arranca llena en
// su límite, cada compra la drena y cada reembolso la rellena. Nada se marca
// como "reembolsado" fila por fila: el saldo es pura aritmética del ledger,
// saldo = límite − compras + reembolsos. No es registro fiscal (eso vive en
// SAP): solo control y registro interno.

export type TipoMovimiento = "compra" | "reembolso";

export interface MovimientoCaja {
  id: string;
  tipo: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  monto: number | string; // numeric llega como string vía supabase-js
  comprador: string | null;
  notas: string | null;
  created_at: string;
}

export interface ResumenCaja {
  limite: number | null; // null = sin configurar
  gastado: number; // total histórico de compras
  reembolsado: number; // total histórico de reembolsos
  saldo: number; // límite − gastado + reembolsado (0 si no hay límite)
  porReembolsar: number; // lo que falta para volver al límite (sugerencia del botón)
  ultimoReembolso: MovimientoCaja | null;
  gastadoDesdeReembolso: number; // compras posteriores al último reembolso
}

// numeric de Postgres llega como string; a número de forma segura.
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function resumenCaja(
  movimientos: MovimientoCaja[],
  limite: number | string | null,
): ResumenCaja {
  const lim = limite === null || limite === undefined ? null : num(limite);
  let gastado = 0;
  let reembolsado = 0;
  for (const m of movimientos) {
    if (m.tipo === "compra") gastado += num(m.monto);
    else if (m.tipo === "reembolso") reembolsado += num(m.monto);
  }

  // El último reembolso por fecha (created_at desempata capturas del mismo día).
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

// Nivel del fondo (0-1) para la barra; el tono avisa cuando la caja se vacía.
export function nivelCaja(r: ResumenCaja): { pct: number; tono: "ok" | "aviso" | "critico" } {
  if (r.limite === null || r.limite <= 0) return { pct: 0, tono: "ok" };
  const pct = Math.max(0, Math.min(1, r.saldo / r.limite));
  return { pct, tono: pct < 0.15 ? "critico" : pct < 0.4 ? "aviso" : "ok" };
}
