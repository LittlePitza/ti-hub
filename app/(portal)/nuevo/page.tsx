import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabasePortal } from "@/lib/supabase";
import { getCorreoPortal, CATEGORIAS_PORTAL } from "@/lib/portal";
import { crearTicketPortal } from "../actions";

export const dynamic = "force-dynamic";

const ERRORES: Record<string, string> = {
  resumen: "Falta el resumen del problema; cuéntanos qué pasa en una línea.",
  guardar: "No pudimos guardar tu reporte, inténtalo de nuevo.",
};

export default async function NuevoReporte({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const correo = await getCorreoPortal();
  if (!correo) redirect("/");

  const sb = getSupabasePortal();
  const { data } = sb
    ? await sb
        .from("equipos")
        .select("id, nombre, marca, modelo")
        .eq("asignado_email", correo)
        .neq("estado", "baja")
        .order("nombre")
    : { data: [] };
  const equipos = data ?? [];
  const pasoFinal = equipos.length > 0 ? 3 : 2;

  return (
    <>
      <Link href="/" className="portal-volver">← Regresar</Link>
      <h1 className="portal-titulo-pagina">Reportar un problema</h1>
      <p className="portal-desc-pagina">
        Contesta estas preguntas y el equipo de TI se encarga del resto.
      </p>

      {error && <div className="login-error" style={{ marginBottom: 20 }}>{ERRORES[error] ?? ERRORES.guardar}</div>}

      <form action={crearTicketPortal}>
        <section className="paso">
          <h2 className="paso-titulo"><span className="paso-num">1</span>¿Qué tipo de problema es?</h2>
          <div className="opciones">
            {CATEGORIAS_PORTAL.map((c) => (
              <label className="opcion" key={c.valor}>
                <input type="radio" name="categoria" value={c.valor} required />
                <span className="opcion-cuerpo">
                  <span className="opcion-titulo">{c.titulo}</span>
                  <span className="opcion-detalle">{c.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {equipos.length > 0 && (
          <section className="paso">
            <h2 className="paso-titulo"><span className="paso-num">2</span>¿Con cuál de tus equipos?</h2>
            <div className="opciones">
              {equipos.map((e) => (
                <label className="opcion" key={e.id}>
                  <input type="radio" name="equipo_id" value={e.id} />
                  <span className="opcion-cuerpo">
                    <span className="opcion-titulo">{e.nombre}</span>
                    <span className="opcion-detalle">
                      {[e.marca, e.modelo].filter(Boolean).join(" ") || "Equipo asignado"}
                    </span>
                  </span>
                </label>
              ))}
              <label className="opcion">
                <input type="radio" name="equipo_id" value="ninguno" defaultChecked />
                <span className="opcion-cuerpo">
                  <span className="opcion-titulo">Con ninguno</span>
                  <span className="opcion-detalle">No tiene que ver con un equipo de la lista</span>
                </span>
              </label>
            </div>
          </section>
        )}

        <section className="paso">
          <h2 className="paso-titulo"><span className="paso-num">{pasoFinal}</span>Cuéntanos qué pasa</h2>
          <div className="portal-campo">
            <label htmlFor="nr-titulo">Resumen</label>
            <input
              id="nr-titulo"
              name="titulo"
              className="portal-input"
              required
              maxLength={120}
              placeholder="Ej. La impresora de la oficina no imprime"
            />
          </div>
          <div className="portal-campo">
            <label htmlFor="nr-desc">Detalles (opcional)</label>
            <textarea
              id="nr-desc"
              name="descripcion"
              className="portal-input"
              placeholder="¿Desde cuándo pasa? ¿Sale algún mensaje de error? ¿Qué ya intentaste?"
            />
          </div>
        </section>

        <button type="submit" className="portal-boton">Enviar reporte</button>
        <p className="portal-nota">
          Tu reporte quedará ligado a <strong>{correo}</strong> y podrás ver su avance en la
          pantalla principal.
        </p>
      </form>
    </>
  );
}
