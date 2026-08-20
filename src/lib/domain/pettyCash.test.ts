import { describe, expect, it } from "vitest";
import { pettyCashLevel, pettyCashSummary, type PettyCashEntry } from "./pettyCash";

function entry(
  over: Partial<PettyCashEntry> & Pick<PettyCashEntry, "tipo" | "monto">,
): PettyCashEntry {
  return {
    id: Math.random().toString(36).slice(2),
    fecha: "2026-03-10",
    concepto: "—",
    comprador: null,
    notas: null,
    created_at: "2026-03-10T10:00:00.000Z",
    ...over,
  };
}

describe("pettyCashSummary", () => {
  it("computes the balance as limit − purchases + reimbursements", () => {
    const r = pettyCashSummary(
      [
        entry({ tipo: "compra", monto: 300 }),
        entry({ tipo: "compra", monto: 200 }),
        entry({ tipo: "reembolso", monto: 400 }),
      ],
      5000,
    );
    expect(r.gastado).toBe(500);
    expect(r.reembolsado).toBe(400);
    expect(r.saldo).toBe(4900);
    expect(r.porReembolsar).toBe(100);
  });

  it("reads a Postgres numeric that arrived as a string", () => {
    const r = pettyCashSummary([entry({ tipo: "compra", monto: "1234.50" })], "5000");
    expect(r.gastado).toBe(1234.5);
    expect(r.limite).toBe(5000);
  });

  it("treats an unset limit as unconfigured rather than zero", () => {
    const r = pettyCashSummary([entry({ tipo: "compra", monto: 300 })], null);
    expect(r.limite).toBeNull();
    expect(r.saldo).toBe(0);
    expect(r.porReembolsar).toBe(0);
  });

  it("never suggests a negative reimbursement when the box is over its limit", () => {
    const r = pettyCashSummary([entry({ tipo: "reembolso", monto: 500 })], 1000);
    expect(r.saldo).toBe(1500);
    expect(r.porReembolsar).toBe(0);
  });

  it("ignores an entry type that is neither a purchase nor a reimbursement", () => {
    const r = pettyCashSummary([entry({ tipo: "ajuste", monto: 999 })], 1000);
    expect(r.gastado).toBe(0);
    expect(r.reembolsado).toBe(0);
  });

  it("picks the latest reimbursement by date, breaking same-day ties on created_at", () => {
    const early = entry({
      tipo: "reembolso",
      monto: 100,
      fecha: "2026-03-10",
      created_at: "2026-03-10T08:00:00.000Z",
    });
    const late = entry({
      tipo: "reembolso",
      monto: 200,
      fecha: "2026-03-10",
      created_at: "2026-03-10T18:00:00.000Z",
    });
    const r = pettyCashSummary([late, early], 5000);
    expect(r.ultimoReembolso?.monto).toBe(200);
  });

  it("counts only the purchases made after the last reimbursement", () => {
    const r = pettyCashSummary(
      [
        entry({ tipo: "compra", monto: 100, fecha: "2026-03-01" }),
        entry({
          tipo: "reembolso",
          monto: 100,
          fecha: "2026-03-05",
          created_at: "2026-03-05T10:00:00.000Z",
        }),
        entry({ tipo: "compra", monto: 250, fecha: "2026-03-08" }),
      ],
      5000,
    );
    expect(r.gastadoDesdeReembolso).toBe(250);
  });

  it("counts every purchase when the box has never been refilled", () => {
    const r = pettyCashSummary(
      [entry({ tipo: "compra", monto: 100 }), entry({ tipo: "compra", monto: 50 })],
      5000,
    );
    expect(r.ultimoReembolso).toBeNull();
    expect(r.gastadoDesdeReembolso).toBe(150);
  });
});

describe("pettyCashLevel", () => {
  const at = (saldo: number, limite: number) =>
    pettyCashLevel({ ...pettyCashSummary([], limite), saldo, limite });

  it("warns as the float drains and turns critical near empty", () => {
    expect(at(1000, 1000).tone).toBe("ok");
    expect(at(500, 1000).tone).toBe("ok");
    expect(at(300, 1000).tone).toBe("aviso");
    expect(at(100, 1000).tone).toBe("critico");
  });

  it("clamps the bar between 0 and 1", () => {
    expect(at(-500, 1000).pct).toBe(0);
    expect(at(2000, 1000).pct).toBe(1);
  });

  it("stays quiet when there is no limit configured", () => {
    expect(pettyCashLevel(pettyCashSummary([], null))).toEqual({ pct: 0, tone: "ok" });
  });
});
