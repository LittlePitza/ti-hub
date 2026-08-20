"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CUSTODY_ROLES, type CustodyParty } from "@/lib/domain/custody";

// Editor for the EXTRA parties on a custody letter (the primary custodian lives
// in scalar columns and is not touched here). A dynamic list of rows that can be
// added and removed; each row either picks an employee from the directory (a
// combobox that freezes their position/department) or takes a name by hand, plus
// a role with suggestions. The whole state is serialised into a hidden
// <input name="personas"> as JSON, which the server action sanitises with
// sanitizeParties. Same pattern as DeviceCredentials.

export type EmployeeChoice = {
  nombre: string;
  correo: string;
  puesto: string | null;
  departamento: string | null;
};

type Row = CustodyParty & { key: number };

const MAX_FILAS = 10;
const TOPE_RESULTADOS = 8;

const FILA_VACIA: Omit<Row, "key"> = {
  fuente: "empleado",
  nombre: "",
  rol: "",
  puesto: "",
  departamento: "",
  correo: "",
};

// One row: an employee combobox (or a hand-typed name) plus a role. It keeps its
// own search UI; the party data is lifted to the parent through onCambio.
function FilaPersona({
  fila,
  empleados,
  rolesId,
  onCambio,
  onQuitar,
}: {
  fila: Row;
  empleados: EmployeeChoice[];
  rolesId: string;
  onCambio: (parche: Partial<CustodyParty>) => void;
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
    const res: EmployeeChoice[] = [];
    for (const e of empleados) {
      if (`${e.nombre} ${e.correo} ${e.departamento ?? ""}`.toLowerCase().includes(q)) {
        res.push(e);
        if (res.length >= TOPE_RESULTADOS) break;
      }
    }
    return res;
  }, [query, empleados]);

  const elegir = (e: EmployeeChoice) => {
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

export default function CustodyPeople({
  personas,
  empleados,
}: {
  personas?: CustodyParty[] | null;
  empleados: EmployeeChoice[];
}) {
  const keyRef = useRef(0);
  const [filas, setFilas] = useState<Row[]>(() =>
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
  const cambiar = (key: number, parche: Partial<CustodyParty>) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...parche } : f)));

  // What travels in the form: only parties that have a name (the server action
  // sanitises again anyway).
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
        {CUSTODY_ROLES.map((r) => (
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
