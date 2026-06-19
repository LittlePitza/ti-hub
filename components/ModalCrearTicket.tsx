"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CATEGORIAS_TK, PRIORIDADES } from "@/lib/tickets";
import { crearTicket, type EstadoCrear } from "@/app/ti/tickets/actions";
import BotonEnviar from "@/components/BotonEnviar";
import SelectorSolicitante, { type EmpleadoOpcion } from "@/components/SelectorSolicitante";

// "Nuevo ticket" abre un modal (mismo <dialog> nativo y estilo que ModalGestionar) con
// el formulario de alta. El solicitante se elige con un combobox de empleados o se
// captura a mano. useActionState da el resultado de la server action: al crear con
// éxito el modal se cierra y el formulario se limpia.

const ICONO_MAS = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function ModalCrearTicket({ empleados }: { empleados: EmpleadoOpcion[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, accion] = useActionState<EstadoCrear, FormData>(crearTicket, null);
  const [correo, setCorreo] = useState("");

  const abrir = () => {
    setCorreo("");
    ref.current?.showModal();
  };

  // Al crear con éxito: limpiar el form y cerrar. (estado es una referencia nueva por
  // envío, así que el efecto corre en cada éxito.)
  useEffect(() => {
    if (estado?.ok) {
      formRef.current?.reset();
      setCorreo("");
      ref.current?.close();
    }
  }, [estado]);

  return (
    <>
      <button type="button" className="boton" onClick={abrir}>
        {ICONO_MAS} Nuevo ticket
      </button>

      <dialog
        ref={ref}
        className="modal-gestionar modal-crear"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="modal-gestionar-card">
          <header className="modal-gestionar-head">
            <div className="modal-gestionar-titulo">
              <h3>Nuevo ticket</h3>
              <span className="suave">Levanta un reporte a nombre de un empleado o contacto</span>
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
            <form ref={formRef} action={accion} className="formulario plano">
              <div className="campos">
                <SelectorSolicitante empleados={empleados} onCorreo={setCorreo} />

                <div className="campo ancho">
                  <label htmlFor="tk-titulo">Asunto</label>
                  <input id="tk-titulo" name="titulo" required placeholder="No imprime desde piso 2" />
                </div>

                <div className="campo">
                  <label htmlFor="tk-categoria">Categoría</label>
                  <select id="tk-categoria" name="categoria" defaultValue="hardware">
                    {CATEGORIAS_TK.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="campo">
                  <label htmlFor="tk-prioridad">Prioridad</label>
                  <select id="tk-prioridad" name="prioridad" defaultValue="media">
                    {PRIORIDADES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="campo ancho">
                  <label htmlFor="tk-asignado">Asignado a</label>
                  <input id="tk-asignado" name="asignado_a" placeholder="Lalo" />
                </div>

                <div className="campo ancho">
                  <label htmlFor="tk-desc">Descripción</label>
                  <textarea id="tk-desc" name="descripcion" placeholder="Qué pasa, desde cuándo, qué se ha intentado…" />
                </div>
              </div>

              <label className={`combo-aviso ${correo ? "" : "inactivo"}`}>
                <input type="checkbox" name="notificar" disabled={!correo} />
                <span>
                  Avisar al solicitante por correo
                  {!correo && <span className="suave"> · requiere un correo válido</span>}
                </span>
              </label>

              {estado?.ok === false && <p className="combo-error">{estado.error}</p>}

              <BotonEnviar className="boton" ocupado="Creando…">Crear ticket</BotonEnviar>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
