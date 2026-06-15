// UI de carga a nivel de ruta: Next la muestra al instante mientras se prepara la
// siguiente página del panel, así navegar entre secciones se siente inmediato.
// Estructura tenue (encabezado + filas) que insinúa la página que viene.
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
