// Route-level loading UI for the employee portal. The portal is opened mostly
// from a phone on the plant network, so a skeleton beats a blank frame.
// Reuses the same skeleton pieces as the panel's loading.tsx.
export default function Cargando() {
  return (
    <div className="ti-cargando" aria-busy aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="ti-cargando-head">
        <span className="esqueleto esqueleto-titulo" />
        <span className="esqueleto esqueleto-desc" />
      </div>
      <div className="ti-cargando-filas">
        {Array.from({ length: 3 }).map((_, i) => (
          <span className="esqueleto esqueleto-fila" key={i} />
        ))}
      </div>
    </div>
  );
}
