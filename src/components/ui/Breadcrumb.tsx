// The report breadcrumb: three nodes (Recibido -> En atención -> Resuelto). The
// current step is highlighted; earlier ones are marked as done. The last step
// (step 3 = resolved/closed/archived) is the end of the journey: on reaching it
// the node is marked complete (a check), not as a pending "current" step. It is
// the portal's signature visual, shared by the home card and the report detail
// page.

export const BREADCRUMB_STEPS = ["Recibido", "En atención", "Resuelto"];

export default function Breadcrumb({ step }: { step: number }) {
  return (
    <ol
      className="ruta"
      aria-label={`Avance: ${BREADCRUMB_STEPS[step - 1] ?? BREADCRUMB_STEPS[0]}`}
    >
      {BREADCRUMB_STEPS.map((label, i) => {
        const n = i + 1;
        // The final node, once reached, counts as complete (journey finished).
        const completado = n < step || (n === step && n === BREADCRUMB_STEPS.length);
        const estado = completado ? "completo" : n === step ? "actual" : "futuro";
        return (
          <li className={`ruta-paso ${estado}`} key={label}>
            <span className="ruta-nodo" aria-hidden>
              {estado === "completo" ? <IconoCheckMini /> : <span className="ruta-punto" />}
            </span>
            <span className="ruta-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function IconoCheckMini() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}
