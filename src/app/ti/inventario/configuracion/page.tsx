import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import {
  DEVICE_CATEGORIES,
  FIELD_TYPES,
  fieldFromRow,
  type CustomField,
} from "@/lib/domain/inventory";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import { createField, editField, deleteField } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración de inventario" };

const ETIQUETA_TIPO: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.value, t.label]),
);

// Fields shared by the create and edit forms for a definition.
// Declared at module level (not nested) so it is not recreated on each render.
function CamposForm({ campo }: { campo: CustomField | null }) {
  const p = campo ? `e-${campo.id}` : "nuevo";
  return (
    <div className="campos">
      <div className="campo">
        <label htmlFor={`${p}-label`}>Etiqueta</label>
        <input
          id={`${p}-label`}
          name="etiqueta"
          defaultValue={campo?.label ?? ""}
          placeholder="N° de serie"
          required
        />
      </div>
      <div className="campo">
        <label htmlFor={`${p}-tipo`}>Tipo de dato</label>
        <select id={`${p}-tipo`} name="tipo" defaultValue={campo?.tipo ?? "texto"}>
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${p}-placeholder`}>Texto de ayuda</label>
        <input
          id={`${p}-placeholder`}
          name="placeholder"
          defaultValue={campo?.placeholder ?? ""}
          placeholder="Opcional"
        />
      </div>
      <div className="campo">
        <label htmlFor={`${p}-orden`}>Orden</label>
        <input id={`${p}-orden`} name="orden" type="number" defaultValue={campo?.orden ?? 0} />
      </div>
      <div className="campo ancho">
        <label htmlFor={`${p}-opciones`}>
          Opciones · una por línea (solo para tipo «Lista de opciones»)
        </label>
        <textarea
          id={`${p}-opciones`}
          name="opciones"
          defaultValue={(campo?.opciones ?? []).join("\n")}
        />
      </div>
      <label className="campo campo-check">
        <input type="checkbox" name="requerido" defaultChecked={campo?.requerido ?? false} />
        <span>Obligatorio al capturar</span>
      </label>
      {campo ? (
        <label className="campo campo-check">
          <input type="checkbox" name="activo" defaultChecked={campo.activo} />
          <span>Activo (visible en los formularios)</span>
        </label>
      ) : null}
    </div>
  );
}

export default async function ConfigInventario() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <Link href="/ti/inventario" className="portal-volver" style={{ marginBottom: 10 }}>
          ← Inventario
        </Link>
        <h1 className="pagina-titulo">Campos del inventario</h1>
        <p className="pagina-desc">
          Agrega campos personalizados por categoría. Aparecen al registrar y editar equipos.
        </p>
      </div>
    </div>
  );
  if (!sb)
    return (
      <>
        {head}
        <NoConnection />
      </>
    );

  const { data } = await sb.from("campos_inventario").select("*").order("categoria").order("orden");
  const campos = (data ?? []).map(fieldFromRow);
  const porCategoria = new Map<string, CustomField[]>();
  for (const c of campos) {
    const arr = porCategoria.get(c.categoria) ?? [];
    arr.push(c);
    porCategoria.set(c.categoria, arr);
  }

  return (
    <>
      {head}

      <div className="config-inv">
        {DEVICE_CATEGORIES.map((cat) => {
          const lista = porCategoria.get(cat.value) ?? [];
          return (
            <section key={cat.value} className="config-inv-cat">
              <h2 className="config-inv-cat-titulo">
                {cat.label} <span className="tab-num">{lista.length}</span>
              </h2>

              {lista.length === 0 ? (
                <p className="suave config-inv-vacio">Sin campos personalizados todavía.</p>
              ) : (
                <div className="plantillas-lista">
                  {lista.map((c) => (
                    <details key={c.id} className="plantilla-fila">
                      <summary>
                        <span className="plantilla-nombre">{c.label}</span>
                        <span className="suave mono" style={{ fontSize: 12.5 }}>
                          {ETIQUETA_TIPO[c.tipo] ?? c.tipo} · {c.clave}
                        </span>
                        {c.requerido ? <span className="insignia info">obligatorio</span> : null}
                        {!c.activo ? <span className="insignia neutro">oculto</span> : null}
                      </summary>

                      <form className="formulario" action={editField} style={{ marginTop: 14 }}>
                        <input type="hidden" name="id" value={c.id} />
                        <CamposForm campo={c} />
                        <div className="fila-acciones">
                          <SubmitButton className="boton" ocupado="Guardando…">
                            Guardar campo
                          </SubmitButton>
                        </div>
                      </form>

                      <form action={deleteField} style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={c.id} />
                        <SubmitButton
                          className="boton secundario mini"
                          style={{ color: "var(--critico)" }}
                          ocupado="…"
                        >
                          Eliminar campo
                        </SubmitButton>
                      </form>
                    </details>
                  ))}
                </div>
              )}

              <details className="plegable config-inv-agregar">
                <summary>+ Agregar campo a {cat.label.toLowerCase()}</summary>
                <form className="formulario plano" action={createField}>
                  <input type="hidden" name="categoria" value={cat.value} />
                  <CamposForm campo={null} />
                  <SubmitButton className="boton" ocupado="Agregando…">
                    Agregar campo
                  </SubmitButton>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
