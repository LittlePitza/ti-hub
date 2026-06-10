export function fechaCorta(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d.length <= 10 ? d + "T12:00:00" : d);
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function folio(n: number): string {
  return "TK-" + String(n).padStart(4, "0");
}
