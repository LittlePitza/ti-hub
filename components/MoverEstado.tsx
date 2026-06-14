"use client";

import { cambiarEstadoTicket } from "@/app/ti/tickets/actions";
import { ESTADOS_TICKET } from "@/lib/tickets";

// Control de triaje del tablero: al cambiar el estado en el select, el formulario
// se envía solo (server action + revalidate), sin un botón "Mover" en cada tarjeta.
// El reloj de SLA y la bitácora los gestiona la propia server action.
export default function MoverEstado({
  id,
  estado,
  etiqueta,
}: {
  id: string;
  estado: string;
  etiqueta: string;
}) {
  return (
    <form action={cambiarEstadoTicket} className="tk-mover">
      <input type="hidden" name="id" value={id} />
      <select
        name="estado"
        defaultValue={estado}
        aria-label={`Mover ${etiqueta} a otro estado`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {ESTADOS_TICKET.map((s) => (
          <option key={s.valor} value={s.valor}>{s.etiqueta}</option>
        ))}
      </select>
    </form>
  );
}
