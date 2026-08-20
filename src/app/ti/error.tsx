"use client";

import { useEffect } from "react";

// Error screen for the panel: avoids the generic Next.js error when a page or a
// query blows up. `reset()` retries rendering the segment.
export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ti] error de página:", error);
  }, [error]);

  return (
    <div className="vacio" role="alert">
      <strong>Algo salió mal</strong>
      No se pudo cargar esta sección. Intenta de nuevo; si el problema sigue, revisa la conexión con
      la base de datos.
      <div style={{ marginTop: 12 }}>
        <button type="button" className="boton" onClick={() => reset()}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
