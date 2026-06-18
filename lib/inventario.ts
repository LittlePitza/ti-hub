// Categorías del inventario: una sola tabla `equipos` dividida por `categoria`.
// Cada categoría reutiliza las columnas genéricas con su propio significado
// (ver supabase/schema.sql); aquí viven las etiquetas que muestra el panel.

export type CategoriaInv = "computo" | "celular" | "linea" | "software";

export const CATEGORIAS_INV: {
  valor: CategoriaInv;
  etiqueta: string;
  singular: string;
  tipos: string[];
  // Etiquetas de columnas/campos genéricos en esta categoría (null = no aplica)
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
    valor: "computo",
    etiqueta: "Cómputo",
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
    valor: "celular",
    etiqueta: "Celulares",
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
    valor: "linea",
    etiqueta: "Líneas telefónicas",
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
    valor: "software",
    etiqueta: "Software",
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

export function categoriaInv(valor: string | undefined): (typeof CATEGORIAS_INV)[number] {
  return CATEGORIAS_INV.find((c) => c.valor === valor) ?? CATEGORIAS_INV[0];
}

// ============================================================
// Credenciales y accesos del equipo (RustDesk, admin local y otros).
// Se guardan en la columna jsonb `equipos.accesos`. SOLO panel de TI.
// ============================================================

export type AccesoExtra = { etiqueta: string; usuario: string; secreto: string };

export interface AccesosInv {
  rustdesk: { id: string; pass: string };
  admin: { usuario: string; pass: string };
  extra: AccesoExtra[];
}

export const ACCESOS_VACIO: AccesosInv = {
  rustdesk: { id: "", pass: "" },
  admin: { usuario: "", pass: "" },
  extra: [],
};

const MAX_LARGO = 200; // por campo
const MAX_EXTRA = 30; // filas de "otros accesos"

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_LARGO) : "";
}

// Normaliza lo que llega del formulario (string JSON u objeto) a la forma
// conocida: recorta strings, descarta filas extra vacías y limita cantidades.
export function sanitizarAccesos(raw: unknown): AccesosInv {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      // entrada inválida → accesos vacíos
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }

  const rd = (obj.rustdesk ?? {}) as Record<string, unknown>;
  const ad = (obj.admin ?? {}) as Record<string, unknown>;
  const extraRaw = Array.isArray(obj.extra) ? obj.extra : [];

  const extra: AccesoExtra[] = [];
  for (const fila of extraRaw) {
    if (extra.length >= MAX_EXTRA) break;
    const f = (fila ?? {}) as Record<string, unknown>;
    const etiqueta = texto(f.etiqueta);
    const usuario = texto(f.usuario);
    const secreto = texto(f.secreto);
    if (etiqueta || usuario || secreto) extra.push({ etiqueta, usuario, secreto });
  }

  return {
    rustdesk: { id: texto(rd.id), pass: texto(rd.pass) },
    admin: { usuario: texto(ad.usuario), pass: texto(ad.pass) },
    extra,
  };
}
