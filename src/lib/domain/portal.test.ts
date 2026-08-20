import { describe, expect, it } from "vitest";
import {
  EMAIL_DOMAIN,
  PORTAL_CATEGORIES,
  PORTAL_STATUS,
  isValidEmail,
  nameFromEmail,
  normalizeEmail,
} from "./portal";

describe("normalizeEmail", () => {
  it("appends the company domain to a bare username", () => {
    expect(normalizeEmail("luis.hernandez")).toBe(`luis.hernandez@${EMAIL_DOMAIN}`);
  });

  it("leaves a complete address untouched, including an outside domain", () => {
    expect(normalizeEmail("alguien@proveedor.com")).toBe("alguien@proveedor.com");
  });

  it("trims and lowercases what the employee typed", () => {
    expect(normalizeEmail("  LUIS.Hernandez  ")).toBe(`luis.hernandez@${EMAIL_DOMAIN}`);
  });

  it("returns an empty string for empty input instead of a bare domain", () => {
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts a well-formed address", () => {
    expect(isValidEmail("luis@plasticospimsa.com")).toBe(true);
  });

  it("rejects anything without a domain part or with whitespace", () => {
    expect(isValidEmail("luis")).toBe(false);
    expect(isValidEmail("luis@plasticospimsa")).toBe(false);
    expect(isValidEmail("luis @pimsa.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("nameFromEmail", () => {
  it("takes the first token of the local part and capitalises it", () => {
    expect(nameFromEmail("luis.hernandez@plasticospimsa.com")).toBe("Luis");
    expect(nameFromEmail("maria_lopez@plasticospimsa.com")).toBe("Maria");
    expect(nameFromEmail("juan-perez@plasticospimsa.com")).toBe("Juan");
  });

  it("handles a local part with no separator", () => {
    expect(nameFromEmail("sistemas@plasticospimsa.com")).toBe("Sistemas");
  });
});

describe("PORTAL_STATUS", () => {
  it("reduces every ticket status to a three-step journey", () => {
    for (const [, meta] of Object.entries(PORTAL_STATUS)) {
      expect(meta.step).toBeGreaterThanOrEqual(1);
      expect(meta.step).toBeLessThanOrEqual(3);
      expect(meta.text).toBeTruthy();
      expect(meta.tone).toBeTruthy();
    }
  });

  it("puts the terminal statuses on the last step", () => {
    expect(PORTAL_STATUS.resuelto.step).toBe(3);
    expect(PORTAL_STATUS.cerrado.step).toBe(3);
    expect(PORTAL_STATUS.archivado.step).toBe(3);
    expect(PORTAL_STATUS.abierto.step).toBe(1);
  });

  it("never leaks IT jargon to the employee", () => {
    expect(PORTAL_STATUS.en_proceso.text).not.toMatch(/SLA|ticket|backlog/i);
  });
});

describe("PORTAL_CATEGORIES", () => {
  it("offers a catch-all so no report can be blocked on categorisation", () => {
    expect(PORTAL_CATEGORIES.at(-1)?.value).toBe("otro");
  });

  it("uses unique values, since they are written straight to the ticket", () => {
    const values = PORTAL_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
