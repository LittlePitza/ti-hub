import { SEMAFORO_TEXTO, type SemaforoSla } from "@/lib/tickets";

// Píldora del semáforo de SLA (En tiempo / Por vencer / Fuera de SLA / En pausa).
export default function PildoraSla({
  semaforo,
  texto,
}: {
  semaforo: SemaforoSla;
  texto?: string;
}) {
  const m = SEMAFORO_TEXTO[semaforo] ?? SEMAFORO_TEXTO.na;
  return <span className={`insignia ${m.tono}`}>{texto ?? m.texto}</span>;
}
