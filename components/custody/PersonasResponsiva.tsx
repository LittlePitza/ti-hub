"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ROLES_RESP, type PersonaResp } from "@/lib/domain/responsivas";

// Editor de las personas ADICIONALES de una responsiva (el resguardatario
// principal vive en columnas escalares y no se toca aquí). Lista dinámica que se
// agrega/quita; cada fila elige un empleado del catálogo (combobox, congela
// puesto/depto) o captura un nombre a mano, más un rol con sugerencias. Todo el
// estado se serializa a un <input hidden name="personas"> en JSON que la server
// action sanea con sanitizarPersonas. Mismo patrón que AccesosEquipo.

export type EmpleadoPersona = {
  nombre: string;
  correo: string;
  puesto: string | null;
  departamento: string | null;
};

type Fila = PersonaResp & { key: number };

const MAX_FILAS = 10;
const TOPE_RESULTADOS = 8;

const FILA_VACIA: Omit<Fila, "key"> = {
  fuente: "empleado",
  nombre: "",
  rol: "",
  puesto: "",
  departamento: "",
  correo: "",
};

// Una fila: combobox de empleado (o nombre a mano) + rol. Mantiene su propia
// UI de búsqueda; los datos de la persona se elevan al padre vía onCambio.
function FilaPersona({
  fila,
  empleados,
  rolesId,
  onCambio,
  onQuitar,
}: {
  fila: Fila;
  empleados: EmpleadoPersona[];
  rolesId: string;
  onCambio: (parche: Partial<PersonaResp>) => void;
  onQuitar: () => void;
}) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const cierreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return empleados.slice(0, TOPE_RESULTADOS);
    const res: EmpleadoPersona[] = [];
    for (const e of empleados) {
      if (`${e.nombre} ${e.correo} ${e.departamento ?? ""}`.toLowerCase().includes(q)) {
        res.push(e);
        if (res.length >= TOPE_RESULTADOS) break;
      }
    }
    return res;
  }, [query, empleados]);

  const elegir = (e: EmpleadoPersona) => {
    onCambio({
      fuente: "empleado",
      nombre: e.nombre,
      correo: e.correo ?? "",
      puesto: e.puesto ?? "",
      departamento: e.departamento ?? "",
    });
    setAbierto(false);
    setQuery("");
  };

  const limpiarEleccion = () =>
    onCambio({ fuente: "empleado", nombre: "", correo: "", puesto: "", departamento: "" });

  const cambiarModo = () =>
    onCambio({
      fuente: fila.fuente === "empleado" ? "manual" : "empleado",
      nombre: "",
      correo: "",
      puesto: "",
      departamento: "",
    });

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
    <li className="persona-fila">
      <div className="persona-fila-cuerpo">
        {fila.fuente === "empleado" ? (
          fila.nombre ? (
            <div className="combo-chip persona-elegido">
              <span>
                <strong>{fila.nombre}</strong>
                {fila.correo ? <span className="suave mono"> · {fila.correo}</span> : null}
              </span>
              <button
                type="button"
                className="combo-chip-x"
                aria-label="Quitar persona elegida"
                onClick={limpiarEleccion}
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="combo">
              <input
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
                        {e.departamento && (
                          <span className="suave combo-opcion-depto">{e.departamento}</span>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )
        ) : (
          <input
            type="text"
            className="persona-manual"
            placeholder="Nombre de la persona"
            value={fila.nombre}
            onChange={(e) => onCambio({ nombre: e.target.value })}
          />
        )}

        <input
          type="text"
          className="persona-rol"
          list={rolesId}
          placeholder="Rol (resguardatario, testigo…)"
          value={fila.rol}
          onChange={(e) => onCambio({ rol: e.target.value })}
          aria-label="Rol de la persona"
        />

        <button type="button" className="boton-texto persona-quitar" onClick={onQuitar}>
          Quitar
        </button>
      </div>

      <button type="button" className="boton-texto combo-cambiar" onClick={cambiarModo}>
        {fila.fuente === "empleado"
          ? "La persona no está en la lista →"
          : "← Elegir un empleado registrado"}
      </button>
    </li>
  );
}

export default function PersonasResponsiva({
  personas,
  empleados,
}: {
  personas?: PersonaResp[] | null;
  empleados: EmpleadoPersona[];
}) {
  const keyRef = useRef(0);
  const [filas, setFilas] = useState<Fila[]>(() =>
    (personas ?? []).map((p) => ({
      key: keyRef.current++,
      fuente: p.fuente === "manual" ? "manual" : "empleado",
      nombre: p.nombre ?? "",
      rol: p.rol ?? "",
      puesto: p.puesto ?? "",
      departamento: p.departamento ?? "",
      correo: p.correo ?? "",
    })),
  );
  const rolesId = useId();

  const agregar = () => {
    if (filas.length >= MAX_FILAS) return;
    setFilas((prev) => [...prev, { key: keyRef.current++, ...FILA_VACIA }]);
  };
  const quitar = (key: number) => setFilas((prev) => prev.filter((f) => f.key !== key));
  const cambiar = (key: number, parche: Partial<PersonaResp>) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...parche } : f)));

  // Lo que viaja en el form: solo personas con nombre (la server action vuelve a sanear).
  const payload = JSON.stringify(
    filas.filter((f) => f.nombre.trim()).map(({ key: _key, ...p }) => p),
  );

  return (
    <section className="personas-resp">
      <input type="hidden" name="personas" value={payload} />
      <div className="personas-resp-titulo">Personas adicionales</div>
      <p className="suave personas-resp-nota">
        El resguardatario principal ya aparece arriba. Agrega co-resguardatarios, testigos o quien
        autoriza; cada uno tendrá su renglón de firma en el documento.
      </p>

      {filas.length === 0 ? (
        <p className="suave personas-vacio">Sin personas adicionales.</p>
      ) : (
        <ul className="personas-lista">
          {filas.map((f) => (
            <FilaPersona
              key={f.key}
              fila={f}
              empleados={empleados}
              rolesId={rolesId}
              onCambio={(parche) => cambiar(f.key, parche)}
              onQuitar={() => quitar(f.key)}
            />
          ))}
        </ul>
      )}

      <datalist id={rolesId}>
        {ROLES_RESP.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <button
        type="button"
        className="boton secundario mini persona-agregar"
        onClick={agregar}
        disabled={filas.length >= MAX_FILAS}
      >
        + Agregar persona
      </button>
    </section>
  );
}
