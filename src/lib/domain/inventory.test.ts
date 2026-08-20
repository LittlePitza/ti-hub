import { describe, expect, it } from "vitest";
import {
  DEVICE_CATEGORIES,
  EMPTY_CREDENTIALS,
  deviceCategory,
  fieldFromRow,
  fieldSlug,
  sanitizeCredentials,
  sanitizeCustomFields,
  type CustomField,
} from "./inventory";

describe("deviceCategory", () => {
  it("falls back to the first category for an unknown value", () => {
    expect(deviceCategory("celular").value).toBe("celular");
    expect(deviceCategory("no_existe")).toBe(DEVICE_CATEGORIES[0]);
    expect(deviceCategory(undefined)).toBe(DEVICE_CATEGORIES[0]);
  });
});

describe("fieldSlug", () => {
  it("strips accents and folds everything else into underscores", () => {
    expect(fieldSlug("Número de serie")).toBe("numero_de_serie");
    expect(fieldSlug("Garantía / Vence")).toBe("garantia_vence");
  });

  it("never returns an empty key", () => {
    expect(fieldSlug("   ")).toBe("campo");
    expect(fieldSlug("!!!")).toBe("campo");
  });

  it("caps the key so it cannot outgrow the column", () => {
    expect(fieldSlug("a".repeat(80))).toHaveLength(40);
  });

  it("does not leave leading or trailing underscores", () => {
    expect(fieldSlug("  ¿Serie?  ")).toBe("serie");
  });
});

describe("fieldFromRow", () => {
  // The row is a raw `campos_inventario` record, so TypeScript cannot check the
  // column names here. The label lives in the Spanish `etiqueta` column.
  it("reads the label from the etiqueta column", () => {
    const f = fieldFromRow({ id: 1, categoria: "computo", clave: "ram", etiqueta: "Memoria RAM" });
    expect(f.label).toBe("Memoria RAM");
  });

  it("defaults a row that is missing optional columns", () => {
    const f = fieldFromRow({ id: 1, clave: "ram", etiqueta: "RAM" });
    expect(f.categoria).toBe("computo");
    expect(f.tipo).toBe("texto");
    expect(f.opciones).toEqual([]);
    expect(f.requerido).toBe(false);
    expect(f.orden).toBe(0);
    expect(f.activo).toBe(true);
  });

  it("treats activo as true unless the column is explicitly false", () => {
    expect(fieldFromRow({ id: 1, activo: false }).activo).toBe(false);
    expect(fieldFromRow({ id: 1, activo: null }).activo).toBe(true);
  });
});

describe("sanitizeCredentials", () => {
  it("accepts either a JSON string or an object", () => {
    const shape = { rustdesk: { id: "123", pass: "x" }, admin: { usuario: "adm", pass: "y" } };
    expect(sanitizeCredentials(JSON.stringify(shape)).rustdesk.id).toBe("123");
    expect(sanitizeCredentials(shape).admin.usuario).toBe("adm");
  });

  it("returns the empty shape for junk rather than throwing", () => {
    expect(sanitizeCredentials("not json")).toEqual(EMPTY_CREDENTIALS);
    expect(sanitizeCredentials(null)).toEqual(EMPTY_CREDENTIALS);
    expect(sanitizeCredentials(42)).toEqual(EMPTY_CREDENTIALS);
  });

  // The extra rows are persisted into the `equipos.accesos` jsonb column, so the
  // key stays Spanish: renaming it would orphan every row already stored.
  it("keeps the persisted etiqueta key on extra credentials", () => {
    const out = sanitizeCredentials({
      extra: [{ etiqueta: " AnyDesk ", usuario: "u", secreto: "s" }],
    });
    expect(out.extra).toEqual([{ etiqueta: "AnyDesk", usuario: "u", secreto: "s" }]);
  });

  it("drops rows that are entirely blank", () => {
    const out = sanitizeCredentials({
      extra: [
        { etiqueta: "", usuario: "", secreto: "" },
        { etiqueta: "VPN", usuario: "", secreto: "" },
      ],
    });
    expect(out.extra).toHaveLength(1);
  });

  it("caps the number of extra rows", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      etiqueta: `a${i}`,
      usuario: "",
      secreto: "",
    }));
    expect(sanitizeCredentials({ extra: many }).extra.length).toBeLessThanOrEqual(30);
  });

  it("caps the length of each field", () => {
    const out = sanitizeCredentials({ rustdesk: { id: "x".repeat(500), pass: "" } });
    expect(out.rustdesk.id).toHaveLength(200);
  });
});

describe("sanitizeCustomFields", () => {
  const defs: CustomField[] = [
    {
      id: "1",
      categoria: "computo",
      clave: "ram",
      label: "RAM",
      tipo: "texto",
      opciones: [],
      placeholder: null,
      requerido: false,
      orden: 0,
      activo: true,
    },
    {
      id: "2",
      categoria: "computo",
      clave: "so",
      label: "Sistema operativo",
      tipo: "opciones",
      opciones: ["Windows 11", "Linux"],
      placeholder: null,
      requerido: false,
      orden: 1,
      activo: true,
    },
  ];

  it("keeps only keys that have a definition", () => {
    const out = sanitizeCustomFields(defs, { ram: "16 GB", intruso: "x" });
    expect(out).toEqual({ ram: "16 GB" });
  });

  it("drops a value that is not one of the declared options", () => {
    expect(sanitizeCustomFields(defs, { so: "Windows 11" })).toEqual({ so: "Windows 11" });
    expect(sanitizeCustomFields(defs, { so: "MS-DOS" })).toEqual({});
  });

  it("drops empty values instead of storing blanks", () => {
    expect(sanitizeCustomFields(defs, { ram: "   " })).toEqual({});
  });

  it("accepts a JSON string and survives junk", () => {
    expect(sanitizeCustomFields(defs, JSON.stringify({ ram: "8 GB" }))).toEqual({ ram: "8 GB" });
    expect(sanitizeCustomFields(defs, "not json")).toEqual({});
    expect(sanitizeCustomFields(defs, null)).toEqual({});
  });

  it("returns nothing when there are no definitions at all", () => {
    expect(sanitizeCustomFields([], { ram: "16 GB" })).toEqual({});
  });
});
