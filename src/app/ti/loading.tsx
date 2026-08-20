// Route-level loading UI: Next shows it instantly while the next panel page is
// prepared, so moving between sections feels immediate. A faint structure
// (header + rows) that hints at the page about to arrive.
export default function Cargando() {
  return (
    <div className="ti-cargando" aria-busy aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="ti-cargando-head">
        <span className="esqueleto esqueleto-titulo" />
        <span className="esqueleto esqueleto-desc" />
      </div>
      <div className="ti-cargando-filas">
        {Array.from({ length: 5 }).map((_, i) => (
          <span className="esqueleto esqueleto-fila" key={i} />
        ))}
      </div>
      <div className="ti-cargando-spinner">
        <span className="spinner" aria-hidden />
        Cargando…
      </div>
    </div>
  );
}
