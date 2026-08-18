"use client";

import { useState } from "react";
import type { CampoInv, ExtrasInv } from "@/lib/inventario";

// Captura de los campos personalizados de una categoría (definidos por TI en
// /ti/inventario/configuracion). Estado local por clave; serializa a un
// <input hidden name="extras"> en JSON que la server action sanea con
// sanitizarExtras. Si la categoría no tiene campos, no renderiza nada.
// Mismo patrón que AccesosEquipo (estado → hidden input JSON).

export default function CamposExtra({
  definiciones,
  valor,
}: {
  definiciones: CampoInv[];
  valor?: ExtrasInv | null;
}) {
  const [vals, setVals] = useState<ExtrasInv>(() => {
    const inicial: ExtrasInv = {};
    for (const d of definiciones) {
      const v = valor?.[d.clave];
      if (v != null) inicial[d.clave] = String(v);
    }
    return inicial;
  });

  if (definiciones.length === 0) return null;

  const set = (clave: string, v: string) => setVals((prev) => ({ ...prev, [clave]: v }));

  return (
    <section className="campos-extra">
      <input type="hidden" name="extras" value={JSON.stringify(vals)} />
      <div className="campos-extra-titulo">Campos adicionales</div>
      <div className="campos">
        {definiciones.map((d) => {
          const id = `extra-${d.clave}`;
          const v = vals[d.clave] ?? "";
          if (d.tipo === "booleano") {
            return (
              <label key={d.clave} className="campo campo-check">
                <input
                  type="checkbox"
                  checked={v === "1"}
                  onChange={(e) => set(d.clave, e.target.checked ? "1" : "")}
                />
                <span>{d.etiqueta}</span>
              </label>
            );
          }
          return (
            <div key={d.clave} className="campo">
              <label htmlFor={id}>
                {d.etiqueta}
                {d.requerido ? " *" : ""}
              </label>
              {d.tipo === "opciones" ? (
                <select
                  id={id}
                  value={v}
                  required={d.requerido}
                  onChange={(e) => set(d.clave, e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {d.opciones.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={d.tipo === "numero" ? "number" : d.tipo === "fecha" ? "date" : "text"}
                  value={v}
                  required={d.requerido}
                  placeholder={d.placeholder ?? undefined}
                  onChange={(e) => set(d.clave, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
