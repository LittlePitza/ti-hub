"use client";

import { useFormStatus } from "react-dom";
import { changeTicketStatus } from "@/app/ti/tickets/actions";
import { TICKET_STATUSES, SELECTABLE_STATUSES } from "@/lib/domain/tickets";

// The board's triage control: changing the status in the select submits the form
// on its own (server action + revalidate), with no "Mover" button on every card.
// The SLA clock and the activity log are handled by the server action itself.
export default function MoveStatus({
  id,
  estado,
  label,
}: {
  id: string;
  estado: string;
  label: string;
}) {
  // Options: the selectable statuses, plus the current status when it is a legacy
  // one (resuelto/cerrado), so the select is never empty on inherited data.
  const opciones = SELECTABLE_STATUSES.includes(estado as never)
    ? SELECTABLE_STATUSES
    : [estado, ...SELECTABLE_STATUSES];
  return (
    <form action={changeTicketStatus} className="tk-mover">
      <input type="hidden" name="id" value={id} />
      <SelectEstado estado={estado} label={label} opciones={opciones} />
    </form>
  );
}

// The select and its spinner live in here so they can read useFormStatus (the
// state of the enclosing <form>): while the action runs, the select is disabled
// and a spinner shows, so the user knows the change is being saved.
function SelectEstado({
  estado,
  label,
  opciones,
}: {
  estado: string;
  label: string;
  opciones: string[];
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <select
        name="estado"
        defaultValue={estado}
        aria-label={`Mover ${label} a otro estado`}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {opciones.map((value) => {
          const meta = TICKET_STATUSES.find((s) => s.value === value);
          return (
            <option key={value} value={value}>
              {meta?.label ?? value}
            </option>
          );
        })}
      </select>
      {pending && <span className="spinner tk-mover-spinner" aria-hidden />}
    </>
  );
}
