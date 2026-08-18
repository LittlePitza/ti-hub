// Responsivas (cartas de resguardo de activos) · fuente de verdad del módulo.
// Cada equipo asignado a un empleado genera una responsiva con la plantilla
// correcta según su categoría/tipo. El contenido base de las 8 plantillas vive
// aquí (PLANTILLAS_DEFAULT); la tabla `plantillas_responsiva` solo guarda los
// overrides que TI edita desde el panel. Porteado de Responsiva_Equipos/*.html.

import type { CategoriaInv } from "./inventario";

export type ClavePlantilla =
  "laptop" | "pc" | "movil" | "monitor" | "impresora" | "servidor" | "software" | "devolucion";

export type EstadoResponsiva =
  "borrador" | "pendiente_firma" | "firmada" | "devuelta" | "cancelada";

export interface ClausulaPlantilla {
  titulo: string;
  texto: string;
}
export interface FirmaPlantilla {
  titulo: string;
  nota: string;
}
export interface Plantilla {
  clave: ClavePlantilla;
  nombre: string; // "Laptop / Portátil"
  codigo: string; // "TI-RES-01"
  titulo: string; // subtítulo del documento
  prefijoFolio: string; // "LAP"
  clausulas: ClausulaPlantilla[];
  accesorios: string[];
  seguridad: string[];
  firmas: FirmaPlantilla[];
  aviso: string;
  iso: string;
  // Campos del equipo que se imprimen en el documento. undefined = todos
  // (comportamiento base); TI lo configura por plantilla desde el panel.
  camposEquipo?: CampoEquipoResp[];
}

// Campos del equipo que pueden mostrarse/ocultarse en la responsiva (el nombre
// del activo siempre sale). El catálogo cubre todo lo que la impresión pinta.
export const CAMPOS_EQUIPO_RESP = [
  { clave: "marca", etiqueta: "Marca / compañía" },
  { clave: "modelo", etiqueta: "Modelo / plan" },
  { clave: "num_serie", etiqueta: "N.º de serie / IMEI / clave" },
  { clave: "telefono", etiqueta: "Teléfono / línea" },
  { clave: "ubicacion", etiqueta: "Ubicación" },
  { clave: "fecha_compra", etiqueta: "Fecha de compra" },
  { clave: "garantia_hasta", etiqueta: "Garantía / vencimiento" },
] as const;
export type CampoEquipoResp = (typeof CAMPOS_EQUIPO_RESP)[number]["clave"];
export const CAMPOS_EQUIPO_TODOS: CampoEquipoResp[] = CAMPOS_EQUIPO_RESP.map((c) => c.clave);

// Snapshot congelado que guarda cada responsiva en la columna `datos`.
export interface DatosResponsiva {
  equipo: {
    categoria: CategoriaInv;
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

// Construye el snapshot del equipo (lo que se congela en `datos.equipo`) a
// partir de una fila de `equipos`. Lo usan tanto la generación inicial como la
// re-sincronización desde inventario.
export function snapshotEquipo(eq: {
  categoria?: string | null;
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  num_serie?: string | null;
  telefono?: string | null;
  ubicacion?: string | null;
  fecha_compra?: string | null;
  garantia_hasta?: string | null;
}): DatosResponsiva["equipo"] {
  return {
    categoria: (eq.categoria ?? "computo") as CategoriaInv,
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

export const ESTADOS_FISICOS = [
  "Nuevo",
  "Usado — buen estado",
  "Usado — con detalles",
  "Reasignado",
];

// Estado del documento → insignia del panel + texto amigable.
export const ESTADOS_RESP: Record<EstadoResponsiva, { tono: string; texto: string }> = {
  borrador: { tono: "neutro", texto: "borrador" },
  pendiente_firma: { tono: "aviso", texto: "pendiente de firma" },
  firmada: { tono: "ok", texto: "firmada" },
  devuelta: { tono: "info", texto: "devuelta" },
  cancelada: { tono: "critico", texto: "cancelada" },
};

export const ESTADOS_RESP_LISTA: EstadoResponsiva[] = [
  "borrador",
  "pendiente_firma",
  "firmada",
  "devuelta",
  "cancelada",
];

// Pista de 4 hitos del ciclo de vida (elemento firma del módulo).
export const HITOS = ["Generada", "Firmada", "Archivada", "Devuelta"] as const;

// Devuelve qué hitos están cumplidos para una responsiva dada.
export function hitosCumplidos(estado: string, tieneArchivo: boolean): boolean[] {
  return [
    true, // Generada: siempre
    estado === "firmada" || estado === "devuelta",
    tieneArchivo,
    estado === "devuelta",
  ];
}

// Mapeo equipo (categoría + tipo del inventario) → plantilla de responsiva.
export function plantillaDeEquipo(categoria: string, tipo: string): ClavePlantilla {
  if (categoria === "software") return "software";
  if (categoria === "celular" || categoria === "linea") return "movil";
  // categoría cómputo: depende del tipo
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

const FIRMAS_ESTANDAR: FirmaPlantilla[] = [
  { titulo: "Entrega — Departamento de Sistemas", nota: "Nombre y firma" },
  { titulo: "Recibe — Colaborador responsable", nota: "Nombre y firma" },
  { titulo: "Vo. Bo. — Jefe inmediato / RR. HH.", nota: "Nombre y firma" },
];

const AVISO_ESTANDAR =
  "El desgaste normal por uso no genera responsabilidad económica. La presente acredita la recepción y aceptación de las condiciones descritas.";

// ============================================================
// Contenido base de las 8 plantillas (porteado de los HTML).
// ============================================================
export const PLANTILLAS_DEFAULT: Record<ClavePlantilla, Plantilla> = {
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

export const PLANTILLAS_LISTA: ClavePlantilla[] = [
  "laptop",
  "pc",
  "movil",
  "monitor",
  "impresora",
  "servidor",
  "software",
  "devolucion",
];

export function plantillaDefault(clave: string): Plantilla {
  return PLANTILLAS_DEFAULT[clave as ClavePlantilla] ?? PLANTILLAS_DEFAULT.laptop;
}

// Mezcla el override de la BD (parcial) sobre el contenido base en código.
export function fusionarPlantilla(
  clave: string,
  override: (Partial<Plantilla> & { campos_equipo?: unknown }) | null | undefined,
): Plantilla {
  const base = plantillaDefault(clave);
  if (!override) return base;
  const merged = { ...base, ...limpiar(override) };
  // La columna de la BD es snake_case y no coincide con el campo camelCase;
  // las demás columnas sí coinciden por nombre, así que solo esta se mapea.
  if (Array.isArray(override.campos_equipo)) {
    merged.camposEquipo = override.campos_equipo as CampoEquipoResp[];
  }
  return merged;
}

function limpiar<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

// ============================================================
// Personas adicionales del documento (co-resguardatarios, testigos, quien
// autoriza…). El resguardatario PRINCIPAL vive en las columnas escalares
// `empleado_*`; estas personas extra van en la columna jsonb `responsivas.personas`
// como snapshot congelado (igual que el resto del documento). Se eligen del
// catálogo de empleados o se capturan a mano. Mismo patrón de saneado que
// `sanitizarAccesos` (lib/inventario.ts).
// ============================================================

export type PersonaResp = {
  nombre: string;
  rol: string;
  puesto?: string;
  departamento?: string;
  correo?: string;
  fuente: "empleado" | "manual";
};

// Roles sugeridos para el <datalist> del editor (el campo es libre).
export const ROLES_RESP = [
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

function txtPersona(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_TXT_PERSONA) : "";
}

// Normaliza lo que llega del formulario (string JSON u objeto) a PersonaResp[]:
// recorta strings, descarta filas sin nombre, valida `fuente` y limita cantidad.
export function sanitizarPersonas(raw: unknown): PersonaResp[] {
  let arr: unknown[] = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      // entrada inválida → sin personas
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }

  const out: PersonaResp[] = [];
  for (const fila of arr) {
    if (out.length >= MAX_PERSONAS) break;
    const f = (fila ?? {}) as Record<string, unknown>;
    const nombre = txtPersona(f.nombre);
    if (!nombre) continue; // sin nombre no hay persona
    const persona: PersonaResp = {
      nombre,
      rol: txtPersona(f.rol),
      fuente: f.fuente === "manual" ? "manual" : "empleado",
    };
    const puesto = txtPersona(f.puesto);
    if (puesto) persona.puesto = puesto;
    const departamento = txtPersona(f.departamento);
    if (departamento) persona.departamento = departamento;
    const correo = txtPersona(f.correo).toLowerCase();
    if (correo) persona.correo = correo;
    out.push(persona);
  }
  return out;
}
