import { describe, expect, it } from "vitest";
import {
  CUSTODY_STATUSES,
  DEFAULT_TEMPLATES,
  MILESTONES,
  TEMPLATE_LIST,
  defaultTemplate,
  deviceSnapshot,
  mergeTemplate,
  milestonesReached,
  sanitizeParties,
  templateForDevice,
} from "./custody";

describe("templateForDevice", () => {
  it("routes by category before ever looking at the type", () => {
    expect(templateForDevice("software", "laptop")).toBe("software");
    expect(templateForDevice("celular", "cualquiera")).toBe("movil");
    expect(templateForDevice("linea", "cualquiera")).toBe("movil");
  });

  it("routes a computo device by its type", () => {
    expect(templateForDevice("computo", "desktop")).toBe("pc");
    expect(templateForDevice("computo", "monitor")).toBe("monitor");
    expect(templateForDevice("computo", "perifericos")).toBe("monitor");
    expect(templateForDevice("computo", "impresora")).toBe("impresora");
    expect(templateForDevice("computo", "red")).toBe("servidor");
    expect(templateForDevice("computo", "servidor")).toBe("servidor");
  });

  it("falls back to the laptop template for an unknown type", () => {
    expect(templateForDevice("computo", "algo_nuevo")).toBe("laptop");
  });

  it("always names a template that actually exists", () => {
    for (const categoria of ["computo", "celular", "linea", "software"]) {
      for (const tipo of ["laptop", "desktop", "monitor", "impresora", "red", "servidor", "?"]) {
        expect(DEFAULT_TEMPLATES[templateForDevice(categoria, tipo)]).toBeDefined();
      }
    }
  });
});

describe("milestonesReached", () => {
  it("always counts the letter as generated", () => {
    expect(milestonesReached("borrador", false)[0]).toBe(true);
  });

  it("marks the signature milestone once signed or returned", () => {
    expect(milestonesReached("firmada", false)[1]).toBe(true);
    expect(milestonesReached("devuelta", false)[1]).toBe(true);
    expect(milestonesReached("pendiente_firma", false)[1]).toBe(false);
  });

  it("ties the archive milestone to the uploaded file, not the status", () => {
    expect(milestonesReached("borrador", true)[2]).toBe(true);
    expect(milestonesReached("firmada", false)[2]).toBe(false);
  });

  it("returns one flag per milestone", () => {
    expect(milestonesReached("devuelta", true)).toHaveLength(MILESTONES.length);
  });
});

describe("templates", () => {
  it("exposes exactly the eight base templates", () => {
    expect(TEMPLATE_LIST).toHaveLength(8);
    expect(Object.keys(DEFAULT_TEMPLATES)).toHaveLength(8);
  });

  it("lists only keys that resolve to a real template", () => {
    for (const clave of TEMPLATE_LIST) expect(DEFAULT_TEMPLATES[clave]).toBeDefined();
  });

  it("gives every template a distinct folio prefix, so folios cannot collide", () => {
    const prefixes = TEMPLATE_LIST.map((clave) => DEFAULT_TEMPLATES[clave].prefijoFolio);
    expect(prefixes.every(Boolean)).toBe(true);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("falls back to a real template for an unknown key", () => {
    expect(defaultTemplate("no_existe")).toBeDefined();
    expect(defaultTemplate("laptop").clave).toBe("laptop");
  });
});

describe("mergeTemplate", () => {
  it("returns the base content untouched when there is no override", () => {
    expect(mergeTemplate("laptop", null)).toEqual(defaultTemplate("laptop"));
    expect(mergeTemplate("laptop", undefined)).toEqual(defaultTemplate("laptop"));
  });

  it("overrides only the columns the row actually carries", () => {
    const base = defaultTemplate("laptop");
    const merged = mergeTemplate("laptop", { titulo: "Otro título" });
    expect(merged.titulo).toBe("Otro título");
    expect(merged.clausulas).toEqual(base.clausulas);
    expect(merged.firmas).toEqual(base.firmas);
  });

  // The clauses are persisted into the `clausulas` jsonb column, so the keys stay
  // Spanish: renaming them would orphan every override already stored.
  it("reads clause overrides through the persisted titulo/texto keys", () => {
    const merged = mergeTemplate("laptop", {
      clausulas: [{ titulo: "Uso", texto: "Solo para trabajo." }],
    });
    expect(merged.clausulas).toEqual([{ titulo: "Uso", texto: "Solo para trabajo." }]);
  });

  it("reaches the snake_case columns the spread cannot", () => {
    const merged = mergeTemplate("laptop", { prefijo_folio: "XYZ" });
    expect(merged.prefijoFolio).toBe("XYZ");
  });

  it("keeps the base content when a jsonb column is null", () => {
    const base = defaultTemplate("laptop");
    const merged = mergeTemplate("laptop", { clausulas: null, accesorios: null });
    expect(merged.clausulas).toEqual(base.clausulas);
    expect(merged.accesorios).toEqual(base.accesorios);
  });

  it("accepts an explicitly emptied clause list", () => {
    expect(mergeTemplate("laptop", { clausulas: [] }).clausulas).toEqual([]);
  });
});

describe("sanitizeParties", () => {
  it("accepts a JSON string or an array of objects", () => {
    const rows = [{ nombre: "Ana", rol: "Testigo", fuente: "manual" }];
    expect(sanitizeParties(JSON.stringify(rows))).toHaveLength(1);
    expect(sanitizeParties(rows)).toHaveLength(1);
  });

  it("drops rows with no name and trims the rest", () => {
    const out = sanitizeParties([
      { nombre: "  Ana  ", rol: "  Testigo  ", fuente: "manual" },
      { nombre: "   ", rol: "Testigo", fuente: "manual" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe("Ana");
    expect(out[0].rol).toBe("Testigo");
  });

  it("normalises an unknown source to empleado", () => {
    const [p] = sanitizeParties([{ nombre: "Ana", rol: "Testigo", fuente: "inventada" }]);
    expect(p.fuente).toBe("empleado");
  });

  it("omits optional fields rather than storing empty strings", () => {
    const [p] = sanitizeParties([{ nombre: "Ana", rol: "Testigo", puesto: "", correo: "  " }]);
    expect(p).not.toHaveProperty("puesto");
    expect(p).not.toHaveProperty("correo");
  });

  it("lowercases the email when there is one", () => {
    const [p] = sanitizeParties([{ nombre: "Ana", rol: "Testigo", correo: "ANA@PIMSA.COM" }]);
    expect(p.correo).toBe("ana@pimsa.com");
  });

  it("returns an empty list for junk rather than throwing", () => {
    expect(sanitizeParties("not json")).toEqual([]);
    expect(sanitizeParties(null)).toEqual([]);
    expect(sanitizeParties({ nope: true })).toEqual([]);
  });
});

describe("deviceSnapshot", () => {
  it("freezes the device columns, defaulting the ones that are missing", () => {
    const snap = deviceSnapshot({ marca: "Dell", modelo: "Latitude" });
    expect(snap.categoria).toBe("computo");
    expect(snap.tipo).toBe("laptop");
    expect(snap.marca).toBe("Dell");
    expect(snap.num_serie).toBeNull();
  });

  it("keeps the device category when the row carries one", () => {
    expect(deviceSnapshot({ categoria: "celular", tipo: "telefono" }).categoria).toBe("celular");
  });
});

describe("CUSTODY_STATUSES", () => {
  it("gives every status a tone and a human label", () => {
    for (const [, meta] of Object.entries(CUSTODY_STATUSES)) {
      expect(meta.tone).toBeTruthy();
      expect(meta.text).toBeTruthy();
    }
  });
});
