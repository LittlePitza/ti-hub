import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { fechaCorta, folioResponsiva } from "@/lib/utils/format";
import {
  ESTADOS_FISICOS,
  ESTADOS_RESP,
  ESTADOS_RESP_LISTA,
  HITOS,
  hitosCumplidos,
  fusionarPlantilla,
  type DatosResponsiva,
  type EstadoResponsiva,
  type PersonaResp,
} from "@/lib/domain/responsivas";
import SinConexion from "@/components/ui/SinConexion";
import BotonEnviar from "@/components/ui/BotonEnviar";
import PersonasResponsiva from "@/components/custody/PersonasResponsiva";
import {
  editarResponsiva,
  subirFirmada,
  cambiarEstadoResponsiva,
  actualizarDesdeInventario,
} from "../actions";
import { jsonbObject, jsonbList } from "@/lib/utils/jsonb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Responsiva" };

export default async function DetalleResponsiva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getSupabase();
  if (!sb) {
    return (
      <>
        <div className="pagina-head">
          <h1 className="pagina-titulo">Responsiva</h1>
        </div>
        <SinConexion />
      </>
    );
  }

  const { data: r } = await sb.from("responsivas").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  // Both queries depend only on `r`, not on each other, so they run together.
  // Catálogo para el selector de personas adicionales (combobox del editor).
  const [{ data: empleadosData }, overrideQ] = await Promise.all([
    sb
      .from("empleados")
      .select("nombre, correo, puesto, departamento")
      .eq("estado", "activo")
      .order("nombre"),
    sb.from("plantillas_responsiva").select("*").eq("clave", r.plantilla).maybeSingle(),
  ]);
  const empleados = empleadosData ?? [];
  const personas = jsonbList<PersonaResp>(r.personas);
  const pl = fusionarPlantilla(r.plantilla, overrideQ.data);
  const datos = jsonbObject<DatosResponsiva>(r.datos, {} as DatosResponsiva);
  const folio = folioResponsiva(pl.prefijoFolio, r.num);
  const ins = ESTADOS_RESP[r.estado as EstadoResponsiva] ?? ESTADOS_RESP.borrador;
  const hechos = hitosCumplidos(r.estado, !!r.archivo_url);

  let urlFirmada: string | null = null;
  if (r.archivo_url) {
    const { data: signed } = await sb.storage
      .from("responsivas")
      .createSignedUrl(r.archivo_url, 3600);
    urlFirmada = signed?.signedUrl ?? null;
  }

  const tieneAccesorios = pl.accesorios.length > 0;
  const tieneSeguridad = pl.seguridad.length > 0;

  return (
    <>
      <div className="pagina-head">
        <div>
          <Link href="/ti/responsivas" className="portal-volver" style={{ marginBottom: 10 }}>
            ← Responsivas
          </Link>
          <h1 className="pagina-titulo mono">{folio}</h1>
          <p className="pagina-desc">
            {pl.nombre} · {pl.codigo}
          </p>
        </div>
        <div className="fila-acciones">
          <span className={`insignia ${ins.tono}`}>{ins.texto}</span>
          <Link href={`/ti/responsivas/${r.id}/imprimir`} className="boton">
            Imprimir
          </Link>
        </div>
      </div>

      {/* Ciclo de resguardo */}
      <div className="via grande" style={{ marginBottom: 28 }}>
        {HITOS.map((h, i) => (
          <span key={h} className={`via-nodo ${hechos[i] ? "hecho" : ""}`}>
            <span className="via-punto" />
            {h}
          </span>
        ))}
      </div>

      {/* Resumen del resguardo */}
      <div className="formulario">
        <h2>Resguardo</h2>
        <div className="campos">
          <div className="campo">
            <label>Equipo</label>
            <div className="celda-principal">{r.equipo_nombre ?? "—"}</div>
            <span className="suave" style={{ fontSize: 12.5 }}>
              {[datos.equipo?.marca, datos.equipo?.modelo].filter(Boolean).join(" ") ||
                datos.equipo?.tipo}
              {datos.equipo?.num_serie ? ` · ${datos.equipo.num_serie}` : ""}
            </span>
          </div>
          <div className="campo">
            <label>Resguardante</label>
            <div className="celda-principal">{r.empleado_nombre}</div>
            <span className="suave mono" style={{ fontSize: 12.5 }}>
              {r.empleado_correo}
            </span>
          </div>
          <div className="campo">
            <label>Generada</label>
            <div className="mono">{fechaCorta(r.fecha_generada)}</div>
          </div>
        </div>
        {r.equipo_id ? (
          <form
            action={actualizarDesdeInventario}
            className="fila-acciones"
            style={{ marginTop: 14 }}
          >
            <input type="hidden" name="id" value={r.id} />
            <BotonEnviar className="boton secundario" ocupado="Actualizando…">
              Actualizar desde inventario
            </BotonEnviar>
            <span className="suave" style={{ fontSize: 12.5 }}>
              Re-lee los datos actuales del equipo en el inventario.
            </span>
          </form>
        ) : (
          <p className="suave" style={{ fontSize: 12.5, marginTop: 14 }}>
            El equipo ya no existe en el inventario; no se puede actualizar.
          </p>
        )}
      </div>

      {/* Editor de datos del documento */}
      <form className="formulario" action={editarResponsiva}>
        <h2>Datos del documento</h2>
        <input type="hidden" name="id" value={r.id} />

        {tieneAccesorios && (
          <fieldset className="grupo-chequeos">
            <legend>Accesorios entregados</legend>
            <div className="chequeos">
              {pl.accesorios.map((a) => (
                <label key={a} className="chequeo">
                  <input
                    type="checkbox"
                    name="accesorios"
                    value={a}
                    defaultChecked={datos.accesorios?.includes(a)}
                  />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {tieneSeguridad && (
          <fieldset className="grupo-chequeos">
            <legend>
              {r.plantilla === "devolucion"
                ? "Verificación técnica de baja"
                : "Configuración de seguridad"}
            </legend>
            <div className="chequeos">
              {pl.seguridad.map((s) => (
                <label key={s} className="chequeo">
                  <input
                    type="checkbox"
                    name="seguridad"
                    value={s}
                    defaultChecked={datos.seguridad?.includes(s)}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="campos">
          <div className="campo">
            <label htmlFor="fecha_entrega">
              {r.plantilla === "devolucion" ? "Fecha de devolución" : "Fecha de entrega"}
            </label>
            <input
              id="fecha_entrega"
              name="fecha_entrega"
              type="date"
              defaultValue={r.fecha_entrega ?? r.fecha_generada}
            />
          </div>
          <div className="campo">
            <label htmlFor="estado_fisico">Estado físico</label>
            <select
              id="estado_fisico"
              name="estado_fisico"
              defaultValue={datos.estado_fisico ?? ESTADOS_FISICOS[1]}
            >
              {ESTADOS_FISICOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div className="campo ancho">
            <label htmlFor="observaciones">Observaciones</label>
            <textarea
              id="observaciones"
              name="observaciones"
              defaultValue={datos.observaciones ?? ""}
              placeholder="Detalles físicos, condiciones especiales…"
            />
          </div>
          <div className="campo ancho">
            <label htmlFor="notas">Notas internas (no salen en el documento)</label>
            <textarea
              id="notas"
              name="notas"
              defaultValue={r.notas ?? ""}
              placeholder="Notas de TI sobre esta responsiva"
            />
          </div>
        </div>
        <PersonasResponsiva personas={personas} empleados={empleados} />
        <BotonEnviar className="boton" ocupado="Guardando…">
          Guardar cambios
        </BotonEnviar>
      </form>

      {/* Ciclo de firma y archivo */}
      <form className="formulario" action={subirFirmada}>
        <h2>Firma y archivo</h2>
        <input type="hidden" name="id" value={r.id} />
        <p className="suave" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Imprime la responsiva, recábala firmada y sube aquí el escaneo (PDF o foto). Al subirlo,
          el resguardo pasa a <strong>firmada</strong>.
        </p>
        {r.archivo_url && (
          <p style={{ marginBottom: 14, fontSize: 13.5 }}>
            Archivo actual:{" "}
            {urlFirmada ? (
              <a
                href={urlFirmada}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--petroleo)", textDecoration: "underline" }}
              >
                {r.archivo_nombre ?? "descargar firmada"}
              </a>
            ) : (
              (r.archivo_nombre ?? "—")
            )}
            {r.fecha_firmada ? (
              <span className="suave"> · firmada {fechaCorta(r.fecha_firmada)}</span>
            ) : null}
          </p>
        )}
        <div className="campos">
          <div className="campo ancho">
            <label htmlFor="archivo">Escaneo firmado</label>
            <input id="archivo" name="archivo" type="file" accept="application/pdf,image/*" />
          </div>
        </div>
        <BotonEnviar className="boton" ocupado="Subiendo…">
          Subir firmada
        </BotonEnviar>
      </form>

      {/* Cambiar estado manualmente */}
      <form className="formulario" action={cambiarEstadoResponsiva}>
        <h2>Cambiar estado</h2>
        <input type="hidden" name="id" value={r.id} />
        <div className="fila-acciones">
          <select name="estado" defaultValue={r.estado}>
            {ESTADOS_RESP_LISTA.map((e) => (
              <option key={e} value={e}>
                {ESTADOS_RESP[e].texto}
              </option>
            ))}
          </select>
          <BotonEnviar className="boton secundario" ocupado="…">
            Actualizar estado
          </BotonEnviar>
        </div>
      </form>
    </>
  );
}
