const MAPA: Record<string, { tono: string; texto: string }> = {
  // equipos
  activo:        { tono: "ok",      texto: "activo" },
  en_reparacion: { tono: "aviso",   texto: "en reparación" },
  almacen:       { tono: "neutro",  texto: "almacén" },
  baja:          { tono: "critico", texto: "baja" },
  // mantenimientos
  programado:    { tono: "info",    texto: "programado" },
  completado:    { tono: "ok",      texto: "completado" },
  cancelado:     { tono: "neutro",  texto: "cancelado" },
  // tickets
  abierto:       { tono: "critico", texto: "abierto" },
  en_proceso:    { tono: "aviso",   texto: "en proceso" },
  resuelto:      { tono: "ok",      texto: "resuelto" },
  cerrado:       { tono: "neutro",  texto: "cerrado" },
  // prioridades
  baja_p:        { tono: "neutro",  texto: "baja" },
  media:         { tono: "info",    texto: "media" },
  alta:          { tono: "aviso",   texto: "alta" },
  critica:       { tono: "critico", texto: "crítica" },
};

export default function Insignia({ valor, esPrioridad = false }: { valor: string; esPrioridad?: boolean }) {
  const clave = esPrioridad && valor === "baja" ? "baja_p" : valor;
  const m = MAPA[clave] ?? { tono: "neutro", texto: valor };
  return <span className={`insignia ${m.tono}`}>{m.texto}</span>;
}
