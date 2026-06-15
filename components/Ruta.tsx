// Ruta del reporte: tres nodos (Recibido → En atención → Resuelto). El nodo del
// paso actual se resalta; los anteriores se marcan como hechos. El último paso
// (paso 3 = resuelto/cerrado/archivado) es el fin del recorrido: al alcanzarlo se
// marca como completo (check), no como "actual" pendiente. Es la firma visual del
// portal y la comparten la tarjeta del inicio y la página de detalle del reporte.

export const PASOS_RUTA = ["Recibido", "En atención", "Resuelto"];

export default function Ruta({ paso }: { paso: number }) {
  return (
    <ol className="ruta" aria-label={`Avance: ${PASOS_RUTA[paso - 1] ?? PASOS_RUTA[0]}`}>
      {PASOS_RUTA.map((etiqueta, i) => {
        const n = i + 1;
        // El nodo final, una vez alcanzado, cuenta como completo (recorrido terminado).
        const completado = n < paso || (n === paso && n === PASOS_RUTA.length);
        const estado = completado ? "completo" : n === paso ? "actual" : "futuro";
        return (
          <li className={`ruta-paso ${estado}`} key={etiqueta}>
            <span className="ruta-nodo" aria-hidden>
              {estado === "completo" ? <IconoCheckMini /> : <span className="ruta-punto" />}
            </span>
            <span className="ruta-label">{etiqueta}</span>
          </li>
        );
      })}
    </ol>
  );
}

function IconoCheckMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}
