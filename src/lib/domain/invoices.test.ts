import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatTotals,
  groupByMonth,
  monthOutstanding,
  paymentSchedule,
  projectVendorDues,
  recurrenceLabel,
  visibleInvoiceStatus,
  type ScheduledInvoice,
  type ScheduledVendor,
} from "./invoices";

function vendor(over: Partial<ScheduledVendor> = {}): ScheduledVendor {
  return {
    id: "v1",
    nombre: "Telmex",
    servicio: "Internet",
    costo: 1200,
    moneda: "MXN",
    periodicidad: "mensual",
    proximo_pago: "2026-03-10",
    activo: true,
    ...over,
  };
}

function invoice(over: Partial<ScheduledInvoice> = {}): ScheduledInvoice {
  return {
    id: "f1",
    num: 1,
    concepto: "Luz",
    monto: 5000,
    moneda: "MXN",
    estado: "pendiente",
    fecha_vencimiento: "2026-03-05",
    proveedor_id: null,
    ...over,
  };
}

describe("addMonths", () => {
  it("clamps to the last day of the target month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29"); // leap year
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("keeps the day when the target month is long enough", () => {
    expect(addMonths("2026-03-10", 1)).toBe("2026-04-10");
    expect(addMonths("2026-03-10", 12)).toBe("2027-03-10");
  });

  it("walks backwards across a year boundary", () => {
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("visibleInvoiceStatus", () => {
  it("derives Vencida from a pending invoice whose date has passed", () => {
    const s = visibleInvoiceStatus(
      { estado: "pendiente", fecha_vencimiento: "2026-03-01" },
      "2026-03-02",
    );
    expect(s.value).toBe("vencida");
    expect(s.tone).toBe("critico");
  });

  it("leaves a pending invoice alone on its own due date", () => {
    const s = visibleInvoiceStatus(
      { estado: "pendiente", fecha_vencimiento: "2026-03-02" },
      "2026-03-02",
    );
    expect(s.value).toBe("pendiente");
  });

  it("never marks a paid invoice overdue, however old", () => {
    const s = visibleInvoiceStatus(
      { estado: "pagada", fecha_vencimiento: "2020-01-01" },
      "2026-03-02",
    );
    expect(s.value).toBe("pagada");
  });
});

describe("projectVendorDues", () => {
  it("projects one occurrence per period inside the window", () => {
    const out = projectVendorDues(vendor(), "2026-03-01", "2026-06-30");
    expect(out.map((d) => d.fecha)).toEqual([
      "2026-03-10",
      "2026-04-10",
      "2026-05-10",
      "2026-06-10",
    ]);
    expect(out.every((d) => d.origen === "proveedor")).toBe(true);
  });

  it("steps by the recurrence, not always by one month", () => {
    const out = projectVendorDues(
      vendor({ periodicidad: "trimestral" }),
      "2026-03-01",
      "2026-12-31",
    );
    expect(out.map((d) => d.fecha)).toEqual([
      "2026-03-10",
      "2026-06-10",
      "2026-09-10",
      "2026-12-10",
    ]);
  });

  it("emits a single date for a one-off payment", () => {
    const out = projectVendorDues(vendor({ periodicidad: "unico" }), "2026-03-01", "2027-12-31");
    expect(out).toHaveLength(1);
  });

  it("flags an anchor left in the past as overdue instead of skipping it", () => {
    const out = projectVendorDues(
      vendor({ proximo_pago: "2026-01-10" }),
      "2026-03-01",
      "2026-03-31",
    );
    expect(out[0].fecha).toBe("2026-01-10");
    expect(out[0].vencido).toBe(true);
    expect(out.at(-1)?.vencido).toBe(false);
  });

  it("projects nothing for an inactive vendor or one with no anchor", () => {
    expect(projectVendorDues(vendor({ activo: false }), "2026-03-01", "2026-12-31")).toEqual([]);
    expect(projectVendorDues(vendor({ proximo_pago: null }), "2026-03-01", "2026-12-31")).toEqual(
      [],
    );
  });

  it("carries the vendor service into the title and normalises an unknown currency", () => {
    const [first] = projectVendorDues(vendor({ moneda: "EUR" }), "2026-03-01", "2026-03-31");
    expect(first.titulo).toBe("Telmex · Internet");
    expect(first.moneda).toBe("MXN");
  });

  it("keeps a variable cost as null rather than coercing it to zero", () => {
    const [first] = projectVendorDues(vendor({ costo: null }), "2026-03-01", "2026-03-31");
    expect(first.monto).toBeNull();
  });
});

describe("paymentSchedule", () => {
  it("merges captured invoices with vendor projections, sorted by date", () => {
    const out = paymentSchedule([invoice()], [vendor()], "2026-03-01", 60);
    expect(out.map((d) => d.fecha)).toEqual(["2026-03-05", "2026-03-10", "2026-04-10"]);
  });

  it("leaves paid and cancelled invoices out of the schedule", () => {
    const out = paymentSchedule(
      [invoice({ estado: "pagada" }), invoice({ id: "f2", estado: "cancelada" })],
      [],
      "2026-03-01",
      60,
    );
    expect(out).toEqual([]);
  });

  it("honours the horizon in days", () => {
    const short = paymentSchedule([], [vendor()], "2026-03-01", 5);
    expect(short).toEqual([]);
  });
});

describe("groupByMonth", () => {
  it("returns one block per month, each carrying its own total", () => {
    const blocks = groupByMonth(paymentSchedule([], [vendor()], "2026-03-01", 92));
    expect(blocks.map((b) => b.clave)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(blocks[0].total.MXN).toBe(1200);
    expect(blocks[0].label).toMatch(/^[A-ZÁÉÍÓÚ]/); // capitalised month name
  });
});

describe("formatTotals", () => {
  it("omits a currency that is zero", () => {
    expect(formatTotals({ MXN: 1200, USD: 0 })).toBe("$1,200.00");
    expect(formatTotals({ MXN: 0, USD: 99 })).toContain("99.00");
    expect(formatTotals({ MXN: 0, USD: 99 })).not.toContain("$0.00");
  });

  it("joins both currencies when both are present", () => {
    expect(formatTotals({ MXN: 1200, USD: 99 })).toContain(" + ");
  });

  it("still shows a zero peso total rather than an empty string", () => {
    expect(formatTotals({ MXN: 0, USD: 0 })).toBe("$0.00");
  });
});

describe("monthOutstanding", () => {
  it("counts this month plus anything already overdue from earlier months", () => {
    const items = paymentSchedule([], [vendor({ proximo_pago: "2026-01-10" })], "2026-03-01", 30);
    // January and February are overdue, March falls inside the month: 3 x 1200.
    expect(monthOutstanding(items, "2026-03-15").MXN).toBe(3600);
  });

  it("skips items with a variable amount", () => {
    const items = paymentSchedule([], [vendor({ costo: null })], "2026-03-01", 30);
    expect(monthOutstanding(items, "2026-03-15").MXN).toBe(0);
  });
});

describe("recurrenceLabel", () => {
  it("falls back to the raw value for something not in the catalogue", () => {
    expect(recurrenceLabel("mensual")).toBe("Mensual");
    expect(recurrenceLabel("quincenal")).toBe("quincenal");
  });
});
