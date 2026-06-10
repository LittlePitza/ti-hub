import Link from "next/link";
import { getSupabasePortal } from "@/lib/supabase";
import { fechaCorta, folio } from "@/lib/format";
import { getCorreoPortal, nombreDeCorreo, CATEGORIAS_PORTAL, ESTADO_PORTAL } from "@/lib/portal";
import { entrarPortal, salirPortal } from "./actions";

export const dynamic = "force-dynamic";

const TITULO_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_PORTAL.map((c) => [c.valor, c.titulo]),
);

export default async function Portal({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string; error?: string }>;
}) {
  const { creado, error } = await searchParams;
  const correo = await getCorreoPortal();
  if (!correo) return <Bienvenida conError={error === "correo"} />;

  const sb = getSupabasePortal();
  if (!sb) {
    return (
      <div className="vacio">
        <strong>Portal sin configurar</strong>
        Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en las variables de entorno del servidor.
      </div>
    );
  }

  const [equiposQ, ticketsQ] = await Promise.all([
    sb.from("equipos")
      .select("id, nombre, marca, modelo")
      .eq("asignado_email", correo)
      .neq("estado", "baja")
      .order("nombre"),
    sb.from("tickets")
      .select("id, num, titulo, categoria, estado, created_at")
      .eq("solicitante_email", correo)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const equipos = equiposQ.data ?? [];
  const tickets = ticketsQ.data ?? [];

  return (
    <>
      <div className="portal-saludo">
        <h1>Hola, {nombreDeCorreo(correo)}</h1>
        <div className="portal-saludo-correo">
          <span>{correo}</span>
          <form action={salirPortal}>
            <button type="submit" className="boton-texto">No soy yo, cambiar correo</button>
          </form>
        </div>
      </div>

      {creado && Number.isFinite(Number(creado)) && (
        <div className="banner-exito">
          <IconoCheck />
          <div>
            <strong>¡Listo! Tu reporte {folio(Number(creado))} fue enviado.</strong>
            El equipo de TI ya lo tiene; aquí podrás seguir su avance.
          </div>
        </div>
      )}

      <Link href="/portal/nuevo" className="cta-reporte">
        <div>
          <div className="cta-reporte-titulo">¿Algo no funciona?</div>
          <div className="cta-reporte-sub">
            Repórtalo en un minuto y el equipo de TI te ayuda.
          </div>
        </div>
        <IconoFlecha />
      </Link>

      {equipos.length > 0 && (
        <section className="portal-seccion">
          <h2 className="portal-seccion-titulo">Tus equipos</h2>
          <div className="equipos-lista">
            {equipos.map((e) => (
              <div className="equipo-chip" key={e.id}>
                <IconoEquipo />
                <div>
                  <div className="equipo-chip-nombre">{e.nombre}</div>
                  <div className="equipo-chip-detalle">
                    {[e.marca, e.modelo].filter(Boolean).join(" ") || "Equipo asignado"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="portal-seccion">
        <h2 className="portal-seccion-titulo">Mis reportes</h2>
        {tickets.length === 0 ? (
          <div className="vacio">
            <strong>Aún no tienes reportes</strong>
            Cuando levantes uno, aquí verás en qué va.
          </div>
        ) : (
          <div className="tickets-lista">
            {tickets.map((t) => {
              const estado = ESTADO_PORTAL[t.estado] ?? ESTADO_PORTAL.abierto;
              return (
                <article className="ticket-card" key={t.id}>
                  <div className="ticket-card-cabecera">
                    <div className="ticket-card-titulo">{t.titulo}</div>
                    <span className={`insignia ${estado.tono}`}>{estado.texto}</span>
                  </div>
                  <div className="ticket-card-meta">
                    <span className="mono">{folio(t.num)}</span>
                    <span>{TITULO_CATEGORIA[t.categoria] ?? t.categoria}</span>
                    <span>{fechaCorta(t.created_at)}</span>
                  </div>
                  <div className="progreso" aria-label={`Avance: ${estado.texto}`}>
                    {[1, 2, 3].map((p) => (
                      <span key={p} className={p <= estado.paso ? "hecho" : ""} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function Bienvenida({ conError }: { conError: boolean }) {
  return (
    <div className="portal-bienvenida">
      <span className="logo-claro">
        <img src="/pimsa-logo.svg" alt="Plásticos PIMSA · más que reciclaje, una visión a futuro" />
      </span>
      <h1>Soporte TI</h1>
      <p>
        ¿Problemas con tu computadora, el correo o algún programa?
        Escribe tu correo para reportarlo y dar seguimiento a tus reportes.
      </p>
      <form className="portal-form-correo" action={entrarPortal}>
        {conError && <div className="login-error">Ese correo no se ve bien, revísalo.</div>}
        <input
          className="portal-input"
          type="email"
          name="correo"
          placeholder="tu.correo@plasticospimsa.com"
          autoComplete="email"
          required
          autoFocus
        />
        <button type="submit" className="portal-boton">Continuar</button>
      </form>
      <p className="portal-nota">
        Sin contraseñas: tu correo solo se usa para mostrarte tus equipos y tus reportes.
      </p>
    </div>
  );
}

function IconoCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function IconoEquipo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M7 21h10" />
      <path d="M12 17v4" />
    </svg>
  );
}
