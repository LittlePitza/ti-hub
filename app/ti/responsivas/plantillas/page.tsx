import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { PLANTILLAS_LISTA, fusionarPlantilla, CAMPOS_EQUIPO_RESP, CAMPOS_EQUIPO_TODOS, type Plantilla } from "@/lib/responsivas";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import { guardarPlantilla, restablecerPlantilla } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plantillas de responsiva" };

export default async function Plantillas() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <Link href="/ti/responsivas" className="portal-volver" style={{ marginBottom: 10 }}>← Responsivas</Link>
        <h1 className="pagina-titulo">Plantillas de responsiva</h1>
        <p className="pagina-desc">Edita las cláusulas, accesorios y firmas de cada formato. Aplica a las responsivas que generes después.</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data: overrides } = await sb.from("plantillas_responsiva").select("*");
  const porClave = new Map((overrides ?? []).map((o) => [o.clave, o]));

  return (
    <>
      {head}

      <div className="plantillas-lista">
        {PLANTILLAS_LISTA.map((clave) => {
          const override = porClave.get(clave);
          const pl: Plantilla = fusionarPlantilla(clave, override);
          const camposVisibles = new Set<string>(pl.camposEquipo ?? CAMPOS_EQUIPO_TODOS);
          const clausulasTexto = pl.clausulas.map((c) => `${c.titulo} | ${c.texto}`).join("\n");
          const firmasTexto = pl.firmas.map((f) => `${f.titulo} | ${f.nota}`).join("\n");
          return (
            <details key={clave} className="plantilla-fila">
              <summary>
                <span className="plantilla-nombre">{pl.nombre}</span>
                <span className="suave mono" style={{ fontSize: 12.5 }}>{pl.codigo} · v{override?.version ?? "1.0"}</span>
                {override && <span className="insignia info">editada</span>}
              </summary>

              <form className="formulario" action={guardarPlantilla} style={{ marginTop: 14 }}>
                <input type="hidden" name="clave" value={clave} />
                <div className="campos">
                  <div className="campo">
                    <label htmlFor={`${clave}-codigo`}>Código</label>
                    <input id={`${clave}-codigo`} name="codigo" defaultValue={pl.codigo} />
                  </div>
                  <div className="campo">
                    <label htmlFor={`${clave}-version`}>Versión</label>
                    <input id={`${clave}-version`} name="version" defaultValue={override?.version ?? "1.0"} />
                  </div>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-titulo`}>Subtítulo del documento</label>
                    <input id={`${clave}-titulo`} name="titulo" defaultValue={pl.titulo} />
                  </div>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-accesorios`}>Accesorios (uno por línea)</label>
                    <textarea id={`${clave}-accesorios`} name="accesorios" defaultValue={pl.accesorios.join("\n")} />
                  </div>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-seguridad`}>Configuración / verificación (una por línea)</label>
                    <textarea id={`${clave}-seguridad`} name="seguridad" defaultValue={pl.seguridad.join("\n")} />
                  </div>
                  <fieldset className="grupo-chequeos campo ancho">
                    <legend>Datos del equipo en el documento</legend>
                    <div className="chequeos">
                      {CAMPOS_EQUIPO_RESP.map((campo) => (
                        <label key={campo.clave} className="chequeo">
                          <input type="checkbox" name="campos_equipo" value={campo.clave} defaultChecked={camposVisibles.has(campo.clave)} />
                          <span>{campo.etiqueta}</span>
                        </label>
                      ))}
                    </div>
                    <p className="suave" style={{ fontSize: 12, margin: "6px 2px 0" }}>
                      Algunos campos solo aparecen si el equipo los tiene (p. ej. teléfono solo en celulares y líneas).
                    </p>
                  </fieldset>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-clausulas`}>Cláusulas · formato «Título | texto», una por línea</label>
                    <textarea id={`${clave}-clausulas`} name="clausulas" defaultValue={clausulasTexto} style={{ minHeight: 140 }} />
                  </div>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-firmas`}>Firmas · formato «Encabezado | nota», una por línea</label>
                    <textarea id={`${clave}-firmas`} name="firmas" defaultValue={firmasTexto} />
                  </div>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-aviso`}>Aviso (recuadro)</label>
                    <textarea id={`${clave}-aviso`} name="aviso" defaultValue={pl.aviso} />
                  </div>
                  <div className="campo ancho">
                    <label htmlFor={`${clave}-iso`}>Pie ISO</label>
                    <textarea id={`${clave}-iso`} name="iso" defaultValue={pl.iso} />
                  </div>
                </div>
                <div className="fila-acciones">
                  <BotonEnviar className="boton" ocupado="Guardando…">Guardar plantilla</BotonEnviar>
                </div>
              </form>

              {override && (
                <form action={restablecerPlantilla} style={{ marginTop: 8 }}>
                  <input type="hidden" name="clave" value={clave} />
                  <BotonEnviar className="boton secundario mini" style={{ color: "var(--critico)" }} ocupado="…">
                    Restablecer al formato base
                  </BotonEnviar>
                </form>
              )}
            </details>
          );
        })}
      </div>
    </>
  );
}
