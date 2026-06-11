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
