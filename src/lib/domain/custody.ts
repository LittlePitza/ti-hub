import { jsonbList } from "@/lib/utils/jsonb";
import type { Tables } from "@/types/database";
// Custody letters (`responsivas`, the legal asset-custody document) — source of
// truth for the module. Every device assigned to an employee produces a letter
// from the template that matches its category/type. The base content of the 8
// templates lives here (DEFAULT_TEMPLATES); the `plantillas_responsiva` table
// stores only the overrides IT edits from the panel.

import type { DeviceCategory } from "./inventory";

export type TemplateKey =
  "laptop" | "pc" | "movil" | "monitor" | "impresora" | "servidor" | "software" | "devolucion";

export type CustodyStatus = "borrador" | "pendiente_firma" | "firmada" | "devuelta" | "cancelada";

export interface TemplateClause {
  titulo: string;
  texto: string;
}
export interface TemplateSignature {
  titulo: string;
  nota: string;
}
export interface Template {
  clave: TemplateKey;
  nombre: string; // "Laptop / Portátil"
  codigo: string; // "TI-RES-01"
  titulo: string; // document subtitle
  prefijoFolio: string; // "LAP"
  clausulas: TemplateClause[];
  accesorios: string[];
  seguridad: string[];
  firmas: TemplateSignature[];
  aviso: string;
  iso: string;
  // Device fields printed on the document. undefined = all of them (the base
  // behaviour); IT configures this per template from the panel.
  camposEquipo?: CustodyDeviceField[];
}

// Device fields that can be shown or hidden on the letter (the asset name is
// always printed). The catalogue covers everything the printed document draws.
export const CUSTODY_DEVICE_FIELDS = [
  { clave: "marca", label: "Marca / compañía" },
  { clave: "modelo", label: "Modelo / plan" },
  { clave: "num_serie", label: "N.º de serie / IMEI / clave" },
  { clave: "telefono", label: "Teléfono / línea" },
  { clave: "ubicacion", label: "Ubicación" },
  { clave: "fecha_compra", label: "Fecha de compra" },
  { clave: "garantia_hasta", label: "Garantía / vencimiento" },
] as const;
export type CustodyDeviceField = (typeof CUSTODY_DEVICE_FIELDS)[number]["clave"];
export const ALL_DEVICE_FIELDS: CustodyDeviceField[] = CUSTODY_DEVICE_FIELDS.map((c) => c.clave);

// Frozen snapshot each custody letter stores in its `datos` column.
export interface CustodySnapshot {
  equipo: {
    categoria: DeviceCategory;
    tipo: string;
    marca: string | null;
    modelo: string | null;
    num_serie: string | null;
    telefono: string | null;
    ubicacion: string | null;
    fecha_compra: string | null;
    garantia_hasta: string | null;
  };
  accesorios: string[]; // accesorios marcados como entregados
  seguridad: string[]; // controles de seguridad marcados
  observaciones: string;
  estado_fisico: string;
}

// Builds the device snapshot (what gets frozen into `datos.equipo`) from a row
// of `equipos`. Used by both the initial generation and the re-sync from
// inventory.
export function deviceSnapshot(eq: {
  categoria?: string | null;
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  num_serie?: string | null;
  telefono?: string | null;
  ubicacion?: string | null;
  fecha_compra?: string | null;
  garantia_hasta?: string | null;
}): CustodySnapshot["equipo"] {
  return {
    categoria: (eq.categoria ?? "computo") as DeviceCategory,
    tipo: eq.tipo ?? "laptop",
    marca: eq.marca ?? null,
    modelo: eq.modelo ?? null,
    num_serie: eq.num_serie ?? null,
    telefono: eq.telefono ?? null,
    ubicacion: eq.ubicacion ?? null,
    fecha_compra: eq.fecha_compra ?? null,
    garantia_hasta: eq.garantia_hasta ?? null,
  };
}

export const PHYSICAL_CONDITIONS = [
  "Nuevo",
  "Usado — buen estado",
  "Usado — con detalles",
  "Reasignado",
];

// Document status -> panel badge tone + human-readable label.
export const CUSTODY_STATUSES: Record<CustodyStatus, { tone: string; text: string }> = {
  borrador: { tone: "neutro", text: "borrador" },
  pendiente_firma: { tone: "aviso", text: "pendiente de firma" },
  firmada: { tone: "ok", text: "firmada" },
  devuelta: { tone: "info", text: "devuelta" },
  cancelada: { tone: "critico", text: "cancelada" },
};

export const CUSTODY_STATUS_LIST: CustodyStatus[] = [
  "borrador",
  "pendiente_firma",
  "firmada",
  "devuelta",
  "cancelada",
];

// The four-milestone lifecycle track (the module's signature UI element).
export const MILESTONES = ["Generada", "Firmada", "Archivada", "Devuelta"] as const;

// Returns which milestones a given custody letter has reached.
export function milestonesReached(estado: string, tieneArchivo: boolean): boolean[] {
  return [
    true, // Generada: siempre
    estado === "firmada" || estado === "devuelta",
    tieneArchivo,
    estado === "devuelta",
  ];
}

// Maps a device (inventory category + type) onto its custody-letter template.
export function templateForDevice(categoria: string, tipo: string): TemplateKey {
  if (categoria === "software") return "software";
  if (categoria === "celular" || categoria === "linea") return "movil";
  // `computo` category: the template depends on the device type
  switch (tipo) {
    case "desktop":
      return "pc";
    case "monitor":
    case "perifericos":
      return "monitor";
    case "impresora":
      return "impresora";
    case "red":
    case "servidor":
      return "servidor";
    default:
      return "laptop";
  }
}

const FIRMAS_ESTANDAR: TemplateSignature[] = [
  { titulo: "Entrega — Departamento de Sistemas", nota: "Nombre y firma" },
  { titulo: "Recibe — Colaborador responsable", nota: "Nombre y firma" },
  { titulo: "Vo. Bo. — Jefe inmediato / RR. HH.", nota: "Nombre y firma" },
];

const AVISO_ESTANDAR =
  "El desgaste normal por uso no genera responsabilidad económica. La presente acredita la recepción y aceptación de las condiciones descritas.";

// ============================================================
// Base content of the 8 templates.
// ============================================================
export const DEFAULT_TEMPLATES: Record<TemplateKey, Template> = {
  laptop: {
    clave: "laptop",
    nombre: "Laptop / Portátil",
    codigo: "TI-RES-01",
    titulo: "Equipo de Cómputo Portátil (Laptop)",
    prefijoFolio: "LAP",
    accesorios: [
      "Cargador / adaptador",
      "Mochila / funda",
      "Mouse",
      "Candado Kensington",
      "Replicador / dock",
      "Adaptador de video",
    ],
    seguridad: [
      "Cifrado de disco (BitLocker)",
      "Antivirus / EDR instalado",
      "Unido al dominio / Entra ID",
      "Gestión MDM (Intune)",
      "Bloqueo de pantalla configurado",
      "Respaldo / OneDrive activo",
      "Usuario sin permisos de administrador",
    ],
    firmas: FIRMAS_ESTANDAR,
    aviso: AVISO_ESTANDAR,
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11 · A.7.9 · A.8.1.",
    clausulas: [
      {
        titulo: "Uso aceptable (A.5.10)",
        texto:
          "La laptop es propiedad de la Empresa y se destina exclusivamente a fines laborales, conforme a las políticas de seguridad de la información.",
      },
      {
        titulo: "Movilidad (A.7.9)",
        texto:
          "Al ser un equipo portátil, extremaré el cuidado fuera de las instalaciones: no lo dejaré desatendido ni a la vista en vehículos, y usaré redes seguras para conectarme.",
      },
      {
        titulo: "Integridad y configuración (A.8.1)",
        texto:
          "No desactivaré el cifrado ni el antivirus, no instalaré software sin licencia o autorización, ni retiraré las etiquetas de inventario.",
      },
      {
        titulo: "Confidencialidad",
        texto: "Protegeré la información almacenada y no compartiré mis credenciales de acceso.",
      },
      {
        titulo: "Reporte de incidentes",
        texto:
          "Reportaré de inmediato a Sistemas cualquier falla, robo, pérdida o incidente de seguridad, presentando acta ante la autoridad cuando aplique.",
      },
      {
        titulo: "No transferencia",
        texto: "No prestaré ni cederé el equipo a terceros sin autorización escrita de Sistemas.",
      },
      {
        titulo: "Devolución (A.5.11)",
        texto:
          "Devolveré el equipo con todos sus accesorios y en buen estado al término de la relación laboral, cambio de puesto o cuando me sea requerido. En caso de daño o pérdida por negligencia comprobada, acepto cubrir el costo de reparación o reposición conforme a la política aplicable.",
      },
    ],
  },
  pc: {
    clave: "pc",
    nombre: "PC de Escritorio",
    codigo: "TI-RES-02",
    titulo: "Equipo de Cómputo de Escritorio",
    prefijoFolio: "PC",
    accesorios: [
      "Monitor(es)",
      "Teclado",
      "Mouse",
      "Cable de poder",
      "No-break / UPS",
      "Adaptador de video",
    ],
    seguridad: [
      "Antivirus / EDR instalado",
      "Unido al dominio / Entra ID",
      "Bloqueo de pantalla configurado",
      "Respaldo configurado",
      "Usuario sin permisos de administrador",
      "Estado físico — buen estado",
    ],
    firmas: FIRMAS_ESTANDAR,
    aviso: AVISO_ESTANDAR,
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11 · A.8.1.",
    clausulas: [
      {
        titulo: "Uso aceptable (A.5.10)",
        texto:
          "El equipo es propiedad de la Empresa y se destina exclusivamente a fines laborales, conforme a las políticas de seguridad de la información.",
      },
      {
        titulo: "Custodia",
        texto:
          "Mantendré el equipo en el sitio asignado; no lo reubicaré ni desconectaré sus componentes sin avisar a Sistemas.",
      },
      {
        titulo: "Integridad y configuración (A.8.1)",
        texto:
          "No instalaré software sin licencia o autorización, no alteraré la configuración de seguridad, ni retiraré etiquetas de inventario.",
      },
      {
        titulo: "Confidencialidad",
        texto: "Protegeré la información almacenada y no compartiré mis credenciales de acceso.",
      },
      {
        titulo: "Reporte de incidentes",
        texto: "Reportaré de inmediato a Sistemas cualquier falla, daño o incidente de seguridad.",
      },
      {
        titulo: "Devolución (A.5.11)",
        texto:
          "Devolveré el equipo y todos sus componentes en buen estado al término de la relación laboral, cambio de puesto o cuando me sea requerido. En caso de daño o pérdida por negligencia comprobada, acepto cubrir el costo conforme a la política aplicable.",
      },
    ],
  },
  movil: {
    clave: "movil",
    nombre: "Móvil / Smartphone / Tablet",
    codigo: "TI-RES-03",
    titulo: "Dispositivo Móvil (Smartphone / Tablet / Línea)",
    prefijoFolio: "MOV",
    accesorios: ["Cargador", "Cable", "Funda / mica", "Audífonos", "Caja", "SIM corporativa"],
    seguridad: [
      "Gestión MDM / MAM inscrita",
      "Bloqueo (PIN / biometría)",
      "Cifrado activo",
      "Borrado remoto habilitado",
      "Estado físico — buen estado",
    ],
    firmas: FIRMAS_ESTANDAR,
    aviso: AVISO_ESTANDAR,
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11 · A.7.9 · A.8.1.",
    clausulas: [
      {
        titulo: "Uso aceptable (A.5.10)",
        texto:
          "El dispositivo y la línea son propiedad de la Empresa y se destinan principalmente a fines laborales, conforme a las políticas vigentes.",
      },
      {
        titulo: "Movilidad (A.7.9)",
        texto:
          "Extremaré el cuidado fuera de las instalaciones; no dejaré el dispositivo desatendido y mantendré activo el bloqueo de pantalla.",
      },
      {
        titulo: "Gestión remota (A.8.1)",
        texto:
          "Autorizo la administración del dispositivo mediante MDM/MAM, incluyendo el borrado remoto de la información corporativa en caso de robo, pérdida o terminación de la relación laboral.",
      },
      {
        titulo: "Configuración",
        texto:
          "No realizaré «jailbreak»/«root», no desactivaré los controles de seguridad ni instalaré aplicaciones no autorizadas para el uso corporativo.",
      },
      {
        titulo: "Consumo",
        texto:
          "Me apegaré al plan contratado; los consumos excedentes por uso personal injustificado podrán ser a mi cargo.",
      },
      {
        titulo: "Reporte de incidentes",
        texto:
          "Reportaré de inmediato a Sistemas cualquier robo, pérdida o incidente, presentando acta ante la autoridad cuando aplique.",
      },
      {
        titulo: "Devolución (A.5.11)",
        texto:
          "Devolveré el dispositivo con sus accesorios y en buen estado al término de la relación laboral o cuando me sea requerido. En caso de daño o pérdida por negligencia comprobada, acepto cubrir el costo conforme a la política aplicable.",
      },
    ],
  },
  monitor: {
    clave: "monitor",
    nombre: "Monitores y Periféricos",
    codigo: "TI-RES-04",
    titulo: "Monitores, Periféricos y Accesorios",
    prefijoFolio: "PER",
    accesorios: [
      "Cable de poder",
      "Cable de video (HDMI / DP)",
      "Cable USB",
      "Base / soporte",
      "Receptor inalámbrico",
      "Pilas",
    ],
    seguridad: [],
    firmas: FIRMAS_ESTANDAR,
    aviso: AVISO_ESTANDAR,
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11.",
    clausulas: [
      {
        titulo: "Uso aceptable (A.5.10)",
        texto:
          "Los activos son propiedad de la Empresa y se destinan exclusivamente a fines laborales.",
      },
      {
        titulo: "Custodia y cuidado",
        texto:
          "Resguardaré los activos con la diligencia debida y los protegeré de daño, pérdida o uso indebido.",
      },
      {
        titulo: "Integridad",
        texto: "No retiraré etiquetas de inventario ni modificaré los activos.",
      },
      { titulo: "Reporte", texto: "Reportaré a Sistemas cualquier falla, daño o pérdida." },
      {
        titulo: "No transferencia",
        texto: "No prestaré ni cederé los activos a terceros sin autorización de Sistemas.",
      },
      {
        titulo: "Devolución (A.5.11)",
        texto:
          "Devolveré los activos en buen estado al término de la relación laboral, cambio de puesto o cuando me sean requeridos. En caso de daño o pérdida por negligencia comprobada, acepto cubrir el costo conforme a la política aplicable.",
      },
    ],
  },
  impresora: {
    clave: "impresora",
    nombre: "Impresora / Multifuncional",
    codigo: "TI-RES-05",
    titulo: "Impresora / Equipo Multifuncional",
    prefijoFolio: "IMP",
    accesorios: [
      "Tóner / cartucho negro",
      "Cartuchos de color (C/M/Y)",
      "Cable de poder",
      "Cable de datos / red",
      "Bandeja adicional",
    ],
    seguridad: [],
    firmas: [
      { titulo: "Entrega — Departamento de Sistemas", nota: "Nombre y firma" },
      { titulo: "Recibe — Responsable / custodio", nota: "Nombre y firma" },
      { titulo: "Vo. Bo. — Jefe de área", nota: "Nombre y firma" },
    ],
    aviso: AVISO_ESTANDAR,
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11 · A.7.10 Medios de almacenamiento.",
    clausulas: [
      {
        titulo: "Uso aceptable (A.5.10)",
        texto:
          "El equipo es propiedad/responsabilidad de la Empresa y se destina exclusivamente a fines laborales.",
      },
      {
        titulo: "Custodia",
        texto:
          "Mantendré el equipo en la ubicación asignada; no lo reubicaré sin avisar a Sistemas.",
      },
      {
        titulo: "Seguridad de la información",
        texto:
          "No dejaré documentos confidenciales en la bandeja de salida y vaciaré la memoria/escaneos conforme a la política de manejo de información.",
      },
      {
        titulo: "Consumibles y mantenimiento",
        texto:
          "Solicitaré consumibles y mantenimiento únicamente a través de Sistemas o el proveedor autorizado; no abriré el equipo para reparaciones.",
      },
      {
        titulo: "Reporte",
        texto: "Reportaré a Sistemas cualquier falla, atasco recurrente o daño.",
      },
      {
        titulo: "Devolución (A.5.11)",
        texto:
          "Devolveré el equipo en buen estado al término del resguardo o cuando me sea requerido. En caso de daño por negligencia comprobada, acepto cubrir el costo conforme a la política aplicable.",
      },
    ],
  },
  servidor: {
    clave: "servidor",
    nombre: "Servidor / Equipo de Red",
    codigo: "TI-RES-06",
    titulo: "Servidor / Equipo de Red / Infraestructura",
    prefijoFolio: "INF",
    accesorios: [],
    seguridad: [
      "Credenciales en bóveda / gestor de secretos",
      "MFA habilitado",
      "Acceso registrado en bitácora",
      "Respaldo / replicación configurado",
    ],
    firmas: [
      { titulo: "Entrega — Responsable de Infraestructura", nota: "Nombre y firma" },
      { titulo: "Recibe — Custodio técnico", nota: "Nombre y firma" },
      { titulo: "Vo. Bo. — Gerente de TI / CISO", nota: "Nombre y firma" },
    ],
    aviso:
      "Documento de resguardo de activo crítico. La firma acredita la aceptación de las responsabilidades de administración descritas. Las contraseñas NO se anotan en este documento; se resguardan en el gestor de secretos autorizado.",
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11 · A.8.2 Accesos privilegiados · A.7.4 Seguridad física · A.8.13 Respaldo.",
    clausulas: [
      {
        titulo: "Uso aceptable y privilegios (A.5.10 / A.8.2)",
        texto:
          "Administraré el activo conforme a mi rol, aplicando el principio de mínimo privilegio y únicamente para fines operativos autorizados.",
      },
      {
        titulo: "Confidencialidad y credenciales",
        texto:
          "Resguardaré las credenciales en el gestor autorizado, no las compartiré y usaré MFA donde aplique.",
      },
      {
        titulo: "Gestión de cambios",
        texto:
          "Aplicaré cambios de configuración a través del proceso de control de cambios y mantendré la documentación actualizada.",
      },
      {
        titulo: "Bitácoras y monitoreo",
        texto: "No deshabilitaré el registro de eventos ni los mecanismos de monitoreo.",
      },
      {
        titulo: "Continuidad",
        texto:
          "Verificaré el funcionamiento de respaldos y reportaré de inmediato cualquier incidente de seguridad o disponibilidad.",
      },
      {
        titulo: "Integridad física",
        texto:
          "No retiraré el activo del site/rack sin autorización ni removeré etiquetas de inventario.",
      },
      {
        titulo: "Devolución / traspaso (A.5.11)",
        texto:
          "Al cambio de rol o término de la relación laboral, entregaré el activo, la documentación y transferiré las credenciales conforme al procedimiento de baja de accesos.",
      },
    ],
  },
  software: {
    clave: "software",
    nombre: "Software / Licencias",
    codigo: "TI-RES-07",
    titulo: "Software, Licencias y Servicios",
    prefijoFolio: "SW",
    accesorios: [],
    seguridad: [
      "Credenciales en gestor autorizado",
      "MFA habilitado",
      "Instalada en equipo autorizado",
    ],
    firmas: [
      { titulo: "Entrega — Departamento de Sistemas", nota: "Nombre y firma" },
      { titulo: "Recibe — Colaborador responsable", nota: "Nombre y firma" },
      { titulo: "Vo. Bo. — Jefe inmediato", nota: "Nombre y firma" },
    ],
    aviso:
      "El uso de software sin licencia o fuera de los términos autorizados es responsabilidad del usuario y puede constituir una falta. La firma acredita la aceptación de estas condiciones.",
    iso: "Controles ISO/IEC 27001:2022: A.5.9 · A.5.10 · A.5.11 · A.5.32 Derechos de propiedad intelectual · A.8.19 Instalación de software.",
    clausulas: [
      {
        titulo: "Uso aceptable (A.5.10)",
        texto:
          "Utilizaré el software y los servicios exclusivamente para fines laborales y conforme a los términos de licenciamiento del fabricante.",
      },
      {
        titulo: "Propiedad intelectual (A.5.32)",
        texto:
          "No copiaré, reinstalaré en equipos no autorizados, ni distribuiré las licencias; reconozco que son propiedad de la Empresa o de su titular.",
      },
      {
        titulo: "Confidencialidad de credenciales",
        texto:
          "Resguardaré usuarios, claves y tokens de acceso, no los compartiré y usaré MFA cuando esté disponible.",
      },
      {
        titulo: "Instalación autorizada",
        texto:
          "No instalaré software adicional sin aprobación de Sistemas, evitando software sin licencia o de origen no confiable.",
      },
      {
        titulo: "Cumplimiento",
        texto: "Permitiré las auditorías de licenciamiento que realice la Empresa.",
      },
      {
        titulo: "Baja (A.5.11)",
        texto:
          "Al término de la relación laboral o cambio de funciones, cesaré el uso, desinstalaré el software y permitiré la reasignación o revocación de las licencias y cuentas.",
      },
    ],
  },
  devolucion: {
    clave: "devolucion",
    nombre: "Acta de Devolución",
    codigo: "TI-DEV-08",
    titulo: "Cierre de resguardo — Devolución de activos",
    prefijoFolio: "DEV",
    accesorios: [],
    seguridad: [
      "Accesorios completos",
      "Información respaldada / transferida",
      "Borrado seguro de datos (A.7.14 / A.8.10)",
      "Cuentas y accesos revocados",
      "Desinscrito de MDM / dominio",
      "Licencias liberadas",
      "Etiqueta de inventario presente",
      "Actualizado en inventario de activos",
    ],
    firmas: [
      { titulo: "Entrega — Colaborador", nota: "Nombre y firma" },
      { titulo: "Recibe — Departamento de Sistemas", nota: "Nombre y firma" },
      { titulo: "Vo. Bo. — RR. HH.", nota: "Nombre y firma" },
    ],
    aviso:
      "Con la firma de la presente, el Departamento de Sistemas hace constar la recepción de los activos descritos y, salvo las observaciones anotadas, libera al colaborador de la responsabilidad de resguardo correspondiente.",
    iso: "Controles ISO/IEC 27001:2022: A.5.11 Devolución de activos · A.7.14 Eliminación segura de equipos · A.8.10 Eliminación de información · A.5.18 Baja de derechos de acceso.",
    clausulas: [],
  },
};

export const TEMPLATE_LIST: TemplateKey[] = [
  "laptop",
  "pc",
  "movil",
  "monitor",
  "impresora",
  "servidor",
  "software",
  "devolucion",
];

export function defaultTemplate(clave: string): Template {
  return DEFAULT_TEMPLATES[clave as TemplateKey] ?? DEFAULT_TEMPLATES.laptop;
}

// A partial override row as stored in `plantillas_responsiva`. jsonb columns
// arrive as `Json`, and two column names are snake_case where the domain type is
// camelCase, so the merge below maps field by field rather than spreading.
export type TemplateOverride = Partial<Tables<"plantillas_responsiva">>;

// Merge the (partial) database override over the base content held in code.
export function mergeTemplate(
  clave: string,
  override: TemplateOverride | null | undefined,
): Template {
  const base = defaultTemplate(clave);
  if (!override) return base;

  // Columns whose name and type already match the domain field.
  const merged: Template = { ...base, ...stripUndefined(pick(override)) };

  // jsonb columns: narrow to the domain shape, keeping the base when absent.
  if (override.clausulas !== undefined && override.clausulas !== null) {
    merged.clausulas = jsonbList<TemplateClause>(override.clausulas);
  }
  if (override.accesorios !== undefined && override.accesorios !== null) {
    merged.accesorios = jsonbList<string>(override.accesorios);
  }
  if (override.seguridad !== undefined && override.seguridad !== null) {
    merged.seguridad = jsonbList<string>(override.seguridad);
  }
  if (override.firmas !== undefined && override.firmas !== null) {
    merged.firmas = jsonbList<TemplateSignature>(override.firmas);
  }

  // These two columns are snake_case; the spread above cannot reach them.
  if (override.prefijo_folio) merged.prefijoFolio = override.prefijo_folio;
  if (Array.isArray(override.campos_equipo)) {
    merged.camposEquipo = override.campos_equipo as CustodyDeviceField[];
  }

  return merged;
}

// The subset of override columns that map onto Plantilla one-to-one by name.
function pick(o: TemplateOverride) {
  return {
    clave: o.clave as TemplateKey | undefined,
    nombre: o.nombre,
    codigo: o.codigo,
    titulo: o.titulo,
    aviso: o.aviso ?? undefined,
    iso: o.iso ?? undefined,
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

// ============================================================
// Extra parties on the document (co-custodians, witnesses, whoever authorises
// it…). The PRIMARY custodian lives in the scalar `empleado_*` columns; these
// extra parties go into the `responsivas.personas` jsonb column as a frozen
// snapshot, like the rest of the document. They are either picked from the
// employee directory or typed in by hand. Same sanitising pattern as
// `sanitizeCredentials` in lib/domain/inventory.ts.
// ============================================================

export type CustodyParty = {
  nombre: string;
  rol: string;
  puesto?: string;
  departamento?: string;
  correo?: string;
  fuente: "empleado" | "manual";
};

// Suggested roles for the editor <datalist> (the field itself is free text).
export const CUSTODY_ROLES = [
  "Resguardatario",
  "Co-resguardatario",
  "Entrega",
  "Recibe",
  "Autoriza",
  "Testigo",
  "Jefe inmediato",
];

const MAX_PERSONAS = 10;
const MAX_TXT_PERSONA = 120;

function partyText(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_TXT_PERSONA) : "";
}

// Normalises whatever the form sends (a JSON string or an object) into
// CustodyParty[]: trims strings, drops rows with no name, validates `fuente`
// and caps the row count.
export function sanitizeParties(raw: unknown): CustodyParty[] {
  let arr: unknown[] = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      // invalid input -> no parties
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }

  const out: CustodyParty[] = [];
  for (const fila of arr) {
    if (out.length >= MAX_PERSONAS) break;
    const f = (fila ?? {}) as Record<string, unknown>;
    const nombre = partyText(f.nombre);
    if (!nombre) continue; // no name means no party
    const persona: CustodyParty = {
      nombre,
      rol: partyText(f.rol),
      fuente: f.fuente === "manual" ? "manual" : "empleado",
    };
    const puesto = partyText(f.puesto);
    if (puesto) persona.puesto = puesto;
    const departamento = partyText(f.departamento);
    if (departamento) persona.departamento = departamento;
    const correo = partyText(f.correo).toLowerCase();
    if (correo) persona.correo = correo;
    out.push(persona);
  }
  return out;
}
