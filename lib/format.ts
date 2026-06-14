export function fechaCorta(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d.length <= 10 ? d + "T12:00:00" : d);
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function fechaHora(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Humaniza una duración en milisegundos: "45 min", "2 h 15 min", "3 d 4 h".
export function duracion(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) {
    const m = min % 60;
    return m ? `${horas} h ${m} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  return h ? `${dias} d ${h} h` : `${dias} d`;
}

export function folio(n: number): string {
  return "TK-" + String(n).padStart(4, "0");
}
