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
      <Link href="/" className="portal-volver">
        <IconoVolver />
        Regresar
      </Link>
      <h1 className="portal-titulo-pagina">Reportar un problema</h1>
      <p className="portal-desc-pagina">
        Tres preguntas rápidas y el equipo de TI se encarga del resto.
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
                  <span className="opcion-icono">{ICONO_CATEGORIA[c.valor]}</span>
                  <span className="opcion-texto">
                    <span className="opcion-titulo">{c.titulo}</span>
                    <span className="opcion-detalle">{c.detalle}</span>
                  </span>
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
                    <span className="opcion-icono"><IconoEquipo /></span>
                    <span className="opcion-texto">
                      <span className="opcion-titulo">{e.nombre}</span>
                      <span className="opcion-detalle">
                        {[e.marca, e.modelo].filter(Boolean).join(" ") || "Equipo asignado"}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
              <label className="opcion">
                <input type="radio" name="equipo_id" value="ninguno" defaultChecked />
                <span className="opcion-cuerpo">
                  <span className="opcion-icono"><IconoNinguno /></span>
                  <span className="opcion-texto">
                    <span className="opcion-titulo">Con ninguno</span>
                    <span className="opcion-detalle">No tiene que ver con un equipo de la lista</span>
                  </span>
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

        <button type="submit" className="portal-boton">
          Enviar reporte
          <IconoFlecha />
        </button>
        <p className="portal-nota">
          Tu reporte quedará ligado a <strong>{correo}</strong> y podrás ver su avance en la
          pantalla principal.
        </p>
      </form>
    </>
  );
}

// Un ícono por categoría: el empleado reconoce su problema de un vistazo, sin leer.
const ICONO_CATEGORIA: Record<string, React.ReactNode> = {
  hardware: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  software: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M8 6h.01M11 6h.01" />
    </svg>
  ),
  red: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.55a11 11 0 0 1 14 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </svg>
  ),
  accesos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3M16 7l3 3M14 9l2 2" />
    </svg>
  ),
  correo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  ),
  otro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  ),
};

function IconoEquipo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M7 21h10M12 17v4" />
    </svg>
  );
}

function IconoNinguno() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </svg>
  );
}

function IconoVolver() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
