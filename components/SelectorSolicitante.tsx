"use client";

import { useId, useMemo, useRef, useState } from "react";

// Selector del solicitante de un ticket. Dos modos:
//  - "empleado": combobox buscable sobre los empleados; al elegir uno se autocompleta
//    su nombre y su correo (el correo liga el ticket a su portal y habilita avisos).
//  - "manual": dos campos libres (nombre + correo) para alguien que no está en la lista.
// Siempre escribe a dos <input type="hidden"> (solicitante, solicitante_email) que el
// <form> envía, así la server action lee los mismos campos en cualquier modo. Notifica
// al padre (vía onCorreo) si hay un correo capturado, para habilitar la casilla de aviso.

export type EmpleadoOpcion = { nombre: string; correo: string; departamento: string | null };

const TOPE_RESULTADOS = 8;

export default function SelectorSolicitante({
  empleados,
  onCorreo,
}: {
  empleados: EmpleadoOpcion[];
  onCorreo?: (correo: string) => void;
}) {
  const [modo, setModo] = useState<"empleado" | "manual">("empleado");
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [elegido, setElegido] = useState<EmpleadoOpcion | null>(null);
  const [nombreManual, setNombreManual] = useState("");
  const [correoManual, setCorreoManual] = useState("");
  const listaId = useId();
  const cierreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return empleados.slice(0, TOPE_RESULTADOS);
    const res: EmpleadoOpcion[] = [];
    for (const e of empleados) {
      if (`${e.nombre} ${e.correo} ${e.departamento ?? ""}`.toLowerCase().includes(q)) {
        res.push(e);
        if (res.length >= TOPE_RESULTADOS) break;
      }
    }
    return res;
  }, [query, empleados]);

  // Valores que se envían en el form, según el modo.
  const nombre = modo === "empleado" ? elegido?.nombre ?? "" : nombreManual.trim();
  const correo = modo === "empleado" ? elegido?.correo ?? "" : correoManual.trim().toLowerCase();

  const elegir = (e: EmpleadoOpcion) => {
    setElegido(e);
    setAbierto(false);
    setQuery("");
    onCorreo?.(e.correo);
  };

  const limpiarEleccion = () => {
    setElegido(null);
    onCorreo?.("");
  };

  const cambiarModo = (m: "empleado" | "manual") => {
    setModo(m);
    setAbierto(false);
    // Reporta el correo vigente del modo destino para sincronizar la casilla de aviso.
    onCorreo?.(m === "empleado" ? elegido?.correo ?? "" : correoManual.trim().toLowerCase());
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && abierto && filtrados[activo]) {
      e.preventDefault();
      elegir(filtrados[activo]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  return (
    <div className="campo ancho">
      <label htmlFor={`${listaId}-input`}>Solicitante</label>

      {/* Campos que el form realmente envía. */}
      <input type="hidden" name="solicitante" value={nombre} />
      <input type="hidden" name="solicitante_email" value={correo} />

      {modo === "empleado" ? (
        elegido ? (
          <div className="combo-chip">
            <span>
              <strong>{elegido.nombre}</strong>
              <span className="suave mono"> · {elegido.correo}</span>
            </span>
            <button type="button" className="combo-chip-x" aria-label="Quitar solicitante" onClick={limpiarEleccion}>
              ✕
            </button>
          </div>
        ) : (
          <div className="combo">
            <input
              id={`${listaId}-input`}
              type="text"
              role="combobox"
              aria-expanded={abierto}
              aria-controls={`${listaId}-lista`}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder="Busca por nombre, correo o área…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setAbierto(true);
                setActivo(0);
              }}
              onFocus={() => setAbierto(true)}
              onBlur={() => {
                // Retraso para no cancelar el onMouseDown de una opción.
                cierreTimer.current = setTimeout(() => setAbierto(false), 120);
              }}
              onKeyDown={teclas}
            />
            {abierto && (
              <ul className="combo-lista" id={`${listaId}-lista`} role="listbox">
                {filtrados.length === 0 ? (
                  <li className="combo-vacio">Sin coincidencias</li>
                ) : (
                  filtrados.map((e, i) => (
                    <li
                      key={e.correo}
                      role="option"
                      aria-selected={i === activo}
                      className={`combo-opcion ${i === activo ? "activa" : ""}`}
                      onMouseEnter={() => setActivo(i)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        if (cierreTimer.current) clearTimeout(cierreTimer.current);
                        elegir(e);
                      }}
                    >
                      <span className="combo-opcion-nombre">{e.nombre}</span>
                      <span className="suave mono combo-opcion-correo">{e.correo}</span>
                      {e.departamento && <span className="suave combo-opcion-depto">{e.departamento}</span>}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )
      ) : (
        <div className="combo-manual">
          <input
            type="text"
            placeholder="Nombre del solicitante"
            value={nombreManual}
            onChange={(e) => setNombreManual(e.target.value)}
          />
          <input
            type="email"
            placeholder="correo@plasticospimsa.com (opcional)"
            value={correoManual}
            onChange={(e) => {
              setCorreoManual(e.target.value);
              onCorreo?.(e.target.value.trim().toLowerCase());
            }}
          />
        </div>
      )}

      <button
        type="button"
        className="boton-texto combo-cambiar"
        onClick={() => cambiarModo(modo === "empleado" ? "manual" : "empleado")}
      >
        {modo === "empleado" ? "El solicitante no está en la lista →" : "← Elegir un empleado registrado"}
      </button>
    </div>
  );
}
