const MAPA: Record<string, { tone: string; text: string }> = {
  // devices
  activo: { tone: "ok", text: "activo" },
  en_reparacion: { tone: "aviso", text: "en reparación" },
  almacen: { tone: "neutro", text: "almacén" },
  baja: { tone: "critico", text: "baja" },
  // maintenance
  programado: { tone: "info", text: "programado" },
  completado: { tone: "ok", text: "completado" },
  cancelado: { tone: "neutro", text: "cancelado" },
  // tickets
  abierto: { tone: "critico", text: "abierto" },
  en_proceso: { tone: "aviso", text: "en proceso" },
  en_espera: { tone: "info", text: "en espera" },
  reabierto: { tone: "critico", text: "reabierto" },
  resuelto: { tone: "ok", text: "resuelto" },
  cerrado: { tone: "neutro", text: "cerrado" },
  archivado: { tone: "neutro", text: "archivado" },
  // priorities
  baja_p: { tone: "neutro", text: "baja" },
  media: { tone: "info", text: "media" },
  alta: { tone: "aviso", text: "alta" },
  critica: { tone: "critico", text: "crítica" },
};

export default function Badge({
  value,
  isPriority = false,
}: {
  value: string;
  isPriority?: boolean;
}) {
  const clave = isPriority && value === "baja" ? "baja_p" : value;
  const m = MAPA[clave] ?? { tone: "neutro", text: value };
  return <span className={`insignia ${m.tone}`}>{m.text}</span>;
}
