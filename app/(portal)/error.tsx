"use client";

import { useEffect } from "react";

// Pantalla de error del portal del empleado: mensaje amable en lugar del
// error genérico de Next.js. `reset()` reintenta el render.
export default function ErrorPortal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] error de página:", error);
  }, [error]);

  return (
    <div className="vacio" role="alert">
      <strong>Algo salió mal</strong>
      No pudimos cargar esta página. Vuelve a intentarlo en un momento; tus reportes están a salvo.
      <div style={{ marginTop: 12 }}>
        <button type="button" className="boton" onClick={() => reset()}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
