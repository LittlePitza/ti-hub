"use client";

import { useFormStatus } from "react-dom";
import { cambiarEstadoTicket } from "@/app/ti/tickets/actions";
import { ESTADOS_TICKET, ESTADOS_SELECCIONABLES } from "@/lib/tickets";

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
  // Opciones: los estados elegibles + el estado actual si fuera uno antiguo (resuelto/
  // cerrado), para que el select no aparezca vacío en datos heredados.
  const opciones = ESTADOS_SELECCIONABLES.includes(estado as never)
    ? ESTADOS_SELECCIONABLES
    : [estado, ...ESTADOS_SELECCIONABLES];
  return (
    <form action={cambiarEstadoTicket} className="tk-mover">
      <input type="hidden" name="id" value={id} />
      <SelectEstado estado={estado} etiqueta={etiqueta} opciones={opciones} />
    </form>
  );
}

// El select y su spinner viven aquí dentro para poder leer useFormStatus (el estado
// del <form> ascendiente): mientras la acción corre, el select se deshabilita y se
// muestra un spinner, así el usuario sabe que su cambio se está guardando.
function SelectEstado({
  estado,
  etiqueta,
  opciones,
}: {
  estado: string;
  etiqueta: string;
  opciones: string[];
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <select
        name="estado"
        defaultValue={estado}
        aria-label={`Mover ${etiqueta} a otro estado`}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {opciones.map((valor) => {
          const meta = ESTADOS_TICKET.find((s) => s.valor === valor);
          return <option key={valor} value={valor}>{meta?.etiqueta ?? valor}</option>;
        })}
      </select>
      {pending && <span className="spinner tk-mover-spinner" aria-hidden />}
    </>
  );
}
