// Inventory categories: a single `equipos` table partitioned by `categoria`.
// Each category reuses the generic columns with its own meaning (see
// supabase/schema.sql); the labels the panel shows live here.

export type DeviceCategory = "computo" | "celular" | "linea" | "software";

export const DEVICE_CATEGORIES: {
  value: DeviceCategory;
  label: string;
  singular: string;
  tipos: string[];
  // Labels for the generic columns/fields in this category (null = not applicable)
  campos: {
    nombre: { label: string; placeholder: string };
    marca: { label: string; placeholder: string } | null;
    modelo: { label: string; placeholder: string } | null;
    num_serie: { label: string; placeholder: string } | null;
    telefono: { label: string; placeholder: string } | null;
    ubicacion: boolean;
    fechas: boolean; // fecha_compra + garantia_hasta
    garantiaLabel: string;
  };
}[] = [
  {
    value: "computo",
    label: "Cómputo",
    singular: "equipo",
    tipos: ["laptop", "desktop", "monitor", "impresora", "red", "servidor", "perifericos", "otro"],
    campos: {
      nombre: { label: "Nombre / etiqueta", placeholder: "LAP-VENTAS-01" },
      marca: { label: "Marca", placeholder: "Dell" },
      modelo: { label: "Modelo", placeholder: "Latitude 5440" },
      num_serie: { label: "Número de serie", placeholder: "DLL5440-0001" },
      telefono: null,
      ubicacion: true,
      fechas: true,
      garantiaLabel: "Garantía hasta",
    },
  },
  {
    value: "celular",
    label: "Celulares y tablets",
    singular: "celular",
    tipos: ["celular", "tablet"],
    campos: {
      nombre: { label: "Nombre / etiqueta", placeholder: "CEL-VENTAS-01" },
      marca: { label: "Marca", placeholder: "Samsung" },
      modelo: { label: "Modelo", placeholder: "Galaxy A54" },
      num_serie: { label: "IMEI", placeholder: "358200000000000" },
      telefono: { label: "Número de línea", placeholder: "81-1234-5678" },
      ubicacion: false,
      fechas: true,
      garantiaLabel: "Garantía hasta",
    },
  },
  {
    value: "linea",
    label: "Líneas telefónicas",
    singular: "línea",
    tipos: ["linea"],
    campos: {
      nombre: { label: "Nombre / etiqueta (opcional)", placeholder: "Línea ventas" },
      marca: { label: "Compañía", placeholder: "Telcel" },
      modelo: { label: "Plan", placeholder: "Plan 5 GB" },
      num_serie: null,
      telefono: { label: "Número", placeholder: "81-9876-5432" },
      ubicacion: false,
      fechas: false,
      garantiaLabel: "Garantía hasta",
    },
  },
  {
    value: "software",
    label: "Software",
    singular: "licencia",
    tipos: ["software"],
    campos: {
      nombre: { label: "Nombre", placeholder: "Microsoft 365 Business" },
      marca: { label: "Proveedor", placeholder: "Microsoft" },
      modelo: { label: "Versión / plan", placeholder: "Business Standard" },
      num_serie: { label: "Clave / licencia", placeholder: "XXXXX-XXXXX-XXXXX" },
      telefono: null,
      ubicacion: false,
      fechas: true,
      garantiaLabel: "Vence / renovación",
    },
  },
];

export function deviceCategory(value: string | undefined): (typeof DEVICE_CATEGORIES)[number] {
  return DEVICE_CATEGORIES.find((c) => c.value === value) ?? DEVICE_CATEGORIES[0];
}

// ============================================================
// Device credentials and access details (RustDesk, local admin and others).
// Stored in the `equipos.accesos` jsonb column. IT PANEL ONLY.
// ============================================================

export type ExtraCredential = { etiqueta: string; usuario: string; secreto: string };

export interface CredentialSet {
  rustdesk: { id: string; pass: string };
  admin: { usuario: string; pass: string };
  extra: ExtraCredential[];
}

export const EMPTY_CREDENTIALS: CredentialSet = {
  rustdesk: { id: "", pass: "" },
  admin: { usuario: "", pass: "" },
  extra: [],
};

const MAX_LARGO = 200; // per field
const MAX_EXTRA = 30; // rows of "otros accesos"

function text(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_LARGO) : "";
}

// Normalises whatever the form sends (a JSON string or an object) into the
// known shape: trims strings, drops empty extra rows and caps the counts.
export function sanitizeCredentials(raw: unknown): CredentialSet {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      // invalid input -> empty credentials
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }

  const rd = (obj.rustdesk ?? {}) as Record<string, unknown>;
  const ad = (obj.admin ?? {}) as Record<string, unknown>;
  const extraRaw = Array.isArray(obj.extra) ? obj.extra : [];

  const extra: ExtraCredential[] = [];
  for (const fila of extraRaw) {
    if (extra.length >= MAX_EXTRA) break;
    const f = (fila ?? {}) as Record<string, unknown>;
    const label = text(f.etiqueta);
    const usuario = text(f.usuario);
    const secreto = text(f.secreto);
    if (label || usuario || secreto) extra.push({ etiqueta: label, usuario, secreto });
  }

  return {
    rustdesk: { id: text(rd.id), pass: text(rd.pass) },
    admin: { usuario: text(ad.usuario), pass: text(ad.pass) },
    extra,
  };
}

// ============================================================
// Custom inventory fields. The DEFINITIONS live in the `campos_inventario`
// table (editable from /ti/inventario/configuracion); the per-device VALUES are
// stored in the `equipos.extras` jsonb column as { [clave]: value }. Same
// sanitising pattern as `accesos`.
// ============================================================

export type FieldType = "texto" | "numero" | "fecha" | "opciones" | "booleano";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "fecha", label: "Fecha" },
  { value: "opciones", label: "Lista de opciones" },
  { value: "booleano", label: "Sí / No" },
];

export interface CustomField {
  id: string;
  categoria: DeviceCategory;
  clave: string;
  label: string;
  tipo: FieldType;
  opciones: string[];
  placeholder: string | null;
  requerido: boolean;
  orden: number;
  activo: boolean;
}

export type CustomFieldValues = Record<string, string>;

// Maps a raw `campos_inventario` row onto the domain type.
export function fieldFromRow(f: Record<string, unknown>): CustomField {
  return {
    id: String(f.id),
    categoria: (f.categoria as DeviceCategory) ?? "computo",
    clave: String(f.clave ?? ""),
    label: String(f.etiqueta ?? ""),
    tipo: (f.tipo as FieldType) ?? "texto",
    opciones: Array.isArray(f.opciones) ? (f.opciones as unknown[]).map((o) => String(o)) : [],
    placeholder: (f.placeholder as string | null) ?? null,
    requerido: Boolean(f.requerido),
    orden: Number(f.orden ?? 0),
    activo: f.activo !== false,
  };
}

// Derives a stable key (slug) from the label: letters/digits/underscore, accents
// stripped.
export function fieldSlug(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "campo";
}

// Sanitises custom-field values against their definitions: keeps only defined
// keys, coerces by type and drops empties.
export function sanitizeCustomFields(defs: CustomField[], raw: unknown): CustomFieldValues {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      // invalid input -> no custom values
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }

  const out: CustomFieldValues = {};
  for (const def of defs) {
    const v = obj[def.clave];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (def.tipo === "numero") {
      const n = Number(s);
      if (Number.isFinite(n)) out[def.clave] = String(n);
    } else if (def.tipo === "fecha") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out[def.clave] = s;
    } else if (def.tipo === "booleano") {
      if (s === "1" || s === "true" || s === "on") out[def.clave] = "1";
    } else if (def.tipo === "opciones") {
      if (def.opciones.includes(s)) out[def.clave] = s;
    } else {
      out[def.clave] = s.slice(0, MAX_LARGO);
    }
  }
  return out;
}
