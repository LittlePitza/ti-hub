import { describe, expect, it } from "vitest";
import {
  adjacentMonth,
  availabilityTone,
  isMonthKey,
  monthKey,
  monthLabel,
  monthRange,
  percentChange,
  recentMonths,
  shortMonthLabel,
} from "./reports";

describe("monthKey", () => {
  it("zero-pads the month", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 1))).toBe("2026-12");
  });
});

describe("isMonthKey", () => {
  it("accepts a real month and rejects everything else", () => {
    expect(isMonthKey("2026-01")).toBe(true);
    expect(isMonthKey("2026-12")).toBe(true);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey("2026")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
    // A user can type anything into ?mes=, so this guard is what keeps the
    // report from rendering a nonsense range.
    expect(isMonthKey("'; drop table tickets --")).toBe(false);
  });
});

describe("monthRange", () => {
  it("returns a half-open interval that ends where the next month starts", () => {
    const march = monthRange("2026-03");
    const april = monthRange("2026-04");
    expect(march.fin).toBe(april.inicio);
    expect(march.inicio).toBeLessThan(march.fin);
  });

  it("spans a whole December into the next January", () => {
    const dec = monthRange("2025-12");
    expect(new Date(dec.fin).getFullYear()).toBe(2026);
    expect(new Date(dec.fin).getMonth()).toBe(0);
  });
});

describe("adjacentMonth", () => {
  it("walks across a year boundary in both directions", () => {
    expect(adjacentMonth("2026-01", -1)).toBe("2025-12");
    expect(adjacentMonth("2025-12", 1)).toBe("2026-01");
    expect(adjacentMonth("2026-03", 0)).toBe("2026-03");
  });
});

describe("recentMonths", () => {
  it("ends at the given month and runs chronologically", () => {
    expect(recentMonths("2026-03", 6)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("returns just the month itself for n = 1", () => {
    expect(recentMonths("2026-03", 1)).toEqual(["2026-03"]);
  });
});

describe("month labels", () => {
  it("capitalises the long label and keeps the year", () => {
    const label = monthLabel("2026-07");
    expect(label).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(label).toContain("2026");
  });

  it("returns a compact label with no trailing dot for the chart axis", () => {
    expect(shortMonthLabel("2026-07")).not.toContain(".");
    expect(shortMonthLabel("2026-07").length).toBeLessThanOrEqual(4);
  });
});

describe("percentChange", () => {
  it("computes the change against the previous month", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(100, 100)).toBe(0);
  });

  it("returns null when there is no baseline, rather than dividing by zero", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it("rounds to a whole percentage", () => {
    expect(percentChange(1, 3)).toBe(-67);
  });
});

describe("availabilityTone", () => {
  it("flags anything below a full internal help-desk target", () => {
    expect(availabilityTone(100)).toBe("ok");
    expect(availabilityTone(99.4)).not.toBe("ok");
    expect(availabilityTone(90)).toBe("critico");
  });
});
