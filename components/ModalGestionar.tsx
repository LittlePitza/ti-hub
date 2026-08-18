"use client";

import { useRef, useState, type ReactNode } from "react";

// Gestionar un equipo abre una tarjeta modal estilo Notion: una "vista pequeña"
// (peek) con el resumen y la acción más común, y un botón para expandirla a la
// tarjeta grande con el editor completo. Mismo <dialog> nativo (backdrop, foco
// atrapado, Escape); el modo (compacta/expandida) solo cambia el ancho y qué
// bloque se muestra, así que el resumen y el editor conviven sin remontarse
// (no se pierde lo escrito en credenciales al alternar).

// Iconos de maximizar/minimizar (flechas diagonales), hoisteados fuera del render.
const ICONO_EXPANDIR = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);
const ICONO_CONTRAER = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export default function ModalGestionar({
  titulo,
  subtitulo,
  resumen,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  resumen: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [expandida, setExpandida] = useState(false);

  const abrir = () => {
    setExpandida(false); // siempre arranca en la vista pequeña
    ref.current?.showModal();
  };

  return (
    <>
      <button type="button" className="boton secundario mini" onClick={abrir}>
        Gestionar
      </button>
      <dialog
        ref={ref}
        className={`modal-gestionar ${expandida ? "expandida" : "compacta"}`}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="modal-gestionar-card">
          <header className="modal-gestionar-head">
            <button
              type="button"
              className="modal-gestionar-modo"
              onClick={() => setExpandida((v) => !v)}
              aria-pressed={expandida}
              aria-label={expandida ? "Contraer tarjeta" : "Expandir tarjeta"}
            >
              {expandida ? ICONO_CONTRAER : ICONO_EXPANDIR}
            </button>
            <div className="modal-gestionar-titulo">
              <h3>{titulo}</h3>
              {subtitulo ? <span className="suave">{subtitulo}</span> : null}
            </div>
            <button
              type="button"
              className="modal-gestionar-x"
              aria-label="Cerrar"
              onClick={() => ref.current?.close()}
            >
              ✕
            </button>
          </header>

          <div className="modal-gestionar-body">
            <div className="modal-resumen">{resumen}</div>
            <button
              type="button"
              className="boton modal-expandir"
              onClick={() => setExpandida(true)}
            >
              {ICONO_EXPANDIR} Expandir para editar
            </button>
            <div className="modal-editor">{children}</div>
          </div>
        </div>
      </dialog>
    </>
  );
}
