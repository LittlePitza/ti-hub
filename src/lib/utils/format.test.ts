import { describe, expect, it } from "vitest";
import {
  currency,
  custodyFolio,
  duration,
  durationParts,
  incidentFolio,
  invoiceFolio,
  shortDate,
  ticketFolio,
} from "./format";

describe("folios", () => {
  it("pads every folio to four digits", () => {
    expect(ticketFolio(7)).toBe("TK-0007");
    expect(invoiceFolio(42)).toBe("FAC-0042");
    expect(incidentFolio(7)).toBe("INC-0007");
    expect(custodyFolio("LAP", 1)).toBe("RES-LAP-0001");
  });

  it("does not truncate a serial past four digits", () => {
    expect(ticketFolio(12345)).toBe("TK-12345");
  });
});

describe("duration", () => {
  it("collapses anything under a minute", () => {
    expect(duration(0)).toBe("menos de 1 min");
    expect(duration(59_000)).toBe("menos de 1 min");
  });

  it("drops the smaller unit when it is zero", () => {
    expect(duration(60 * 60_000)).toBe("1 h");
    expect(duration(24 * 60 * 60_000)).toBe("1 d");
  });

  it("keeps two units otherwise", () => {
    expect(duration(135 * 60_000)).toBe("2 h 15 min");
    expect(duration((3 * 24 * 60 + 4 * 60) * 60_000)).toBe("3 d 4 h");
  });

  it("treats a negative or non-finite span as zero", () => {
    expect(duration(-1)).toBe("menos de 1 min");
    expect(duration(Number.NaN)).toBe("menos de 1 min");
  });
});

describe("durationParts", () => {
  it("splits into value/unit pairs so the UI can size them apart", () => {
    expect(durationParts(135 * 60_000)).toEqual([
      { value: "2", unit: "h" },
      { value: "15", unit: "min" },
    ]);
  });

  it("emits a single pair when the smaller unit is zero", () => {
    expect(durationParts(2 * 60 * 60_000)).toEqual([{ value: "2", unit: "h" }]);
  });
});

describe("currency", () => {
  it("renders MXN by default and USD on request", () => {
    expect(currency(1234.5)).toBe("$1,234.50");
    // es-MX resolves the USD symbol to the ISO code joined by U+00A0, not to
    // "US$". The separator is normalised here so the assertion stays readable.
    expect(currency(99, "USD").replace(/\u00a0/g, " ")).toBe("USD 99.00");
  });

  it("renders a dash for a missing amount rather than $0.00", () => {
    expect(currency(null)).toBe("—");
    expect(currency(undefined)).toBe("—");
    expect(currency(Number.NaN)).toBe("—");
  });
});

describe("shortDate", () => {
  it("renders a dash for a missing date", () => {
    expect(shortDate(null)).toBe("—");
    expect(shortDate("")).toBe("—");
  });

  it("reads a bare date as local noon, so the day never slips a timezone", () => {
    // A `date` column arrives as "YYYY-MM-DD". Parsing that as UTC midnight would
    // render the previous day anywhere west of Greenwich.
    expect(shortDate("2026-03-01")).toContain("01");
    expect(shortDate("2026-03-01")).toContain("2026");
  });
});
