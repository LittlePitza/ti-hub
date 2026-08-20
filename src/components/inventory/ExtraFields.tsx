"use client";

import { useState } from "react";
import type { CustomField, CustomFieldValues } from "@/lib/domain/inventory";

// Capture for a category's custom fields (defined by IT at
// /ti/inventario/configuracion). Local state keyed by field key; serialised into
// a hidden <input name="extras"> as JSON that the server action sanitises with
// sanitizeCustomFields. Renders nothing when the category has no custom fields.
// Same pattern as DeviceCredentials (state -> hidden JSON input).

export default function ExtraFields({
  definiciones,
  value,
}: {
  definiciones: CustomField[];
  value?: CustomFieldValues | null;
}) {
  const [vals, setVals] = useState<CustomFieldValues>(() => {
    const inicial: CustomFieldValues = {};
    for (const d of definiciones) {
      const v = value?.[d.clave];
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
                <span>{d.label}</span>
              </label>
            );
          }
          return (
            <div key={d.clave} className="campo">
              <label htmlFor={id}>
                {d.label}
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
