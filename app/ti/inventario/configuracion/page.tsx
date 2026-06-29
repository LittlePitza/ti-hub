import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { CATEGORIAS_INV, TIPOS_CAMPO, campoDeFila, type CampoInv } from "@/lib/inventario";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import { crearCampo, editarCampo, eliminarCampo } from "./actions";

export const dynamic = "force-dynamic";

const ETIQUETA_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS_CAMPO.map((t) => [t.valor, t.label]),
);

// Campos compartidos por el form de alta y el de edición de una definición.
// A nivel de módulo (no anidado) para no recrearlo por render.
function CamposForm({ campo }: { campo: CampoInv | null }) {
  const p = campo ? `e-${campo.id}` : "nuevo";
  return (
    <div className="campos">
      <div className="campo">
        <label htmlFor={`${p}-etiqueta`}>Etiqueta</label>
        <input id={`${p}-etiqueta`} name="etiqueta" defaultValue={campo?.etiqueta ?? ""} placeholder="N° de serie" required />
      </div>
      <div className="campo">
        <label htmlFor={`${p}-tipo`}>Tipo de dato</label>
        <select id={`${p}-tipo`} name="tipo" defaultValue={campo?.tipo ?? "texto"}>
          {TIPOS_CAMPO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${p}-placeholder`}>Texto de ayuda</label>
        <input id={`${p}-placeholder`} name="placeholder" defaultValue={campo?.placeholder ?? ""} placeholder="Opcional" />
      </div>
      <div className="campo">
        <label htmlFor={`${p}-orden`}>Orden</label>
        <input id={`${p}-orden`} name="orden" type="number" defaultValue={campo?.orden ?? 0} />
      </div>
      <div className="campo ancho">
        <label htmlFor={`${p}-opciones`}>Opciones · una por línea (solo para tipo «Lista de opciones»)</label>
        <textarea id={`${p}-opciones`} name="opciones" defaultValue={(campo?.opciones ?? []).join("\n")} />
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
        <Link href="/ti/inventario" className="portal-volver" style={{ marginBottom: 10 }}>← Inventario</Link>
        <h1 className="pagina-titulo">Campos del inventario</h1>
        <p className="pagina-desc">Agrega campos personalizados por categoría. Aparecen al registrar y editar equipos.</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data } = await sb.from("campos_inventario").select("*").order("categoria").order("orden");
  const campos = (data ?? []).map(campoDeFila);
  const porCategoria = new Map<string, CampoInv[]>();
  for (const c of campos) {
    const arr = porCategoria.get(c.categoria) ?? [];
    arr.push(c);
    porCategoria.set(c.categoria, arr);
  }

  return (
    <>
      {head}

      <div className="config-inv">
        {CATEGORIAS_INV.map((cat) => {
          const lista = porCategoria.get(cat.valor) ?? [];
          return (
            <section key={cat.valor} className="config-inv-cat">
              <h2 className="config-inv-cat-titulo">
                {cat.etiqueta} <span className="tab-num">{lista.length}</span>
              </h2>

              {lista.length === 0 ? (
                <p className="suave config-inv-vacio">Sin campos personalizados todavía.</p>
              ) : (
                <div className="plantillas-lista">
                  {lista.map((c) => (
                    <details key={c.id} className="plantilla-fila">
                      <summary>
                        <span className="plantilla-nombre">{c.etiqueta}</span>
                        <span className="suave mono" style={{ fontSize: 12.5 }}>{ETIQUETA_TIPO[c.tipo] ?? c.tipo} · {c.clave}</span>
                        {c.requerido ? <span className="insignia info">obligatorio</span> : null}
                        {!c.activo ? <span className="insignia neutro">oculto</span> : null}
                      </summary>

                      <form className="formulario" action={editarCampo} style={{ marginTop: 14 }}>
                        <input type="hidden" name="id" value={c.id} />
                        <CamposForm campo={c} />
                        <div className="fila-acciones">
                          <BotonEnviar className="boton" ocupado="Guardando…">Guardar campo</BotonEnviar>
                        </div>
                      </form>

                      <form action={eliminarCampo} style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={c.id} />
                        <BotonEnviar className="boton secundario mini" style={{ color: "var(--critico)" }} ocupado="…">
                          Eliminar campo
                        </BotonEnviar>
                      </form>
                    </details>
                  ))}
                </div>
              )}

              <details className="plegable config-inv-agregar">
                <summary>+ Agregar campo a {cat.etiqueta.toLowerCase()}</summary>
                <form className="formulario plano" action={crearCampo}>
                  <input type="hidden" name="categoria" value={cat.valor} />
                  <CamposForm campo={null} />
                  <BotonEnviar className="boton" ocupado="Agregando…">Agregar campo</BotonEnviar>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
