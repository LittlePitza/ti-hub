import Link from "next/link";
import { getSupabasePortal } from "@/lib/supabase";
import { fechaCorta, folio } from "@/lib/format";
import {
  getCorreoPortal,
  nombreDeCorreo,
  CATEGORIAS_PORTAL,
  ESTADO_PORTAL,
  DOMINIO_CORREO,
} from "@/lib/portal";
import Ruta from "@/components/Ruta";
import BotonEnviar from "@/components/BotonEnviar";
import AvisoServicios from "@/components/AvisoServicios";
import {
  entrarPortal,
  salirPortal,
  archivarReportePortal,
  reactivarReportePortal,
} from "./actions";

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

  const [equiposQ, ticketsQ, empleadoQ] = await Promise.all([
    sb
      .from("equipos")
      .select("id, nombre, marca, modelo")
      .eq("asignado_email", correo)
      .neq("estado", "baja")
      .order("nombre"),
    sb
      .from("tickets")
      .select("id, num, titulo, categoria, estado, created_at")
      .eq("solicitante_email", correo)
      .order("created_at", { ascending: false })
      .limit(30),
    sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle(),
  ]);
  const equipos = equiposQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const nombre = empleadoQ.data?.nombre?.split(" ")[0] || nombreDeCorreo(correo);
  const activos = tickets.filter((t) => ESTADO_PORTAL[t.estado]?.paso !== 3).length;
  // Los archivados se recogen en su propia pestaña; el resto queda a la vista.
  const visibles = tickets.filter((t) => t.estado !== "archivado");
  const archivados = tickets.filter((t) => t.estado === "archivado");

  // Cuántas respuestas de TI tiene cada ticket (solo eventos `respuesta`). El texto
  // completo vive en el detalle del reporte; aquí basta el conteo para la tarjeta.
  const ids = tickets.map((t) => t.id);
  const respuestasQ = ids.length
    ? await sb
        .from("ticket_eventos")
        .select("ticket_id")
        .eq("tipo", "respuesta")
        .in("ticket_id", ids)
    : { data: [] };
  const respuestasPorTicket: Record<string, number> = {};
  for (const r of respuestasQ.data ?? []) {
    respuestasPorTicket[r.ticket_id] = (respuestasPorTicket[r.ticket_id] ?? 0) + 1;
  }

  return (
    <>
      <AvisoServicios />

      {creado && Number.isFinite(Number(creado)) && (
        <div className="banner-exito" role="status">
          <IconoCheck />
          <div>
            <strong>Listo, recibimos tu reporte {folio(Number(creado))}.</strong>
            El equipo de TI ya lo tiene. Sigue su avance aquí abajo.
          </div>
        </div>
      )}

      <section className="portal-hero">
        <Onda />
        <p className="portal-hero-saludo">Hola, {nombre}</p>
        <p className="portal-hero-sub">
          {activos > 0
            ? `Tienes ${activos} ${activos === 1 ? "reporte en curso" : "reportes en curso"}. ¿Algo más que no funcione?`
            : "¿Algo de tu equipo, correo o sistemas no funciona?"}
        </p>
        <Link href="/nuevo" className="portal-hero-cta">
          Reportar un problema
          <IconoFlecha />
        </Link>
        <div className="portal-hero-pie">
          <span className="portal-hero-correo">{correo}</span>
          <form action={salirPortal}>
            <BotonEnviar className="portal-hero-cambiar" ocupado="Saliendo…">
              No soy yo
            </BotonEnviar>
          </form>
        </div>
      </section>

      <section className="portal-seccion">
        <h2 className="portal-seccion-titulo">Mis reportes</h2>
        {visibles.length === 0 ? (
          <div className="portal-vacio">
            <IconoBandeja />
            <strong>
              {archivados.length > 0 ? "Sin reportes a la vista" : "Todo en orden por ahora"}
            </strong>
            <span>
              {archivados.length > 0
                ? "Tus reportes archivados están más abajo."
                : "Cuando levantes un reporte, aquí verás en qué paso va."}
            </span>
          </div>
        ) : (
          <div className="tickets-lista">
            {visibles.map((t) => {
              const estado = ESTADO_PORTAL[t.estado] ?? ESTADO_PORTAL.abierto;
              const numRespuestas = respuestasPorTicket[t.id] ?? 0;
              return (
                <article className="ticket-card" key={t.id}>
                  <div className="ticket-card-cabecera">
                    <h3 className="ticket-card-titulo">
                      <Link className="ticket-card-link" href={`/reporte/${t.id}`}>
                        {t.titulo}
                      </Link>
                    </h3>
                    <span className={`insignia ${estado.tono}`}>{estado.texto}</span>
                  </div>
                  <div className="ticket-card-meta">
                    <span className="mono">{folio(t.num)}</span>
                    <span>·</span>
                    <span>{TITULO_CATEGORIA[t.categoria] ?? t.categoria}</span>
                    <span>·</span>
                    <span>{fechaCorta(t.created_at)}</span>
                  </div>
                  <Ruta paso={estado.paso} />
                  <div className="ticket-card-pie">
                    {numRespuestas > 0 ? (
                      <span className="ticket-card-respuestas">
                        <IconoMensaje />
                        Soporte TI te respondió
                        {numRespuestas > 1 && ` · ${numRespuestas} mensajes`}
                      </span>
                    ) : (
                      <span className="ticket-card-pie-vacio">Sin respuestas todavía</span>
                    )}
                    <form action={archivarReportePortal} className="ticket-card-archivar">
                      <input type="hidden" name="id" value={t.id} />
                      <BotonEnviar
                        className=""
                        title="Guardar este reporte en tus archivados"
                        ocupado="Archivando…"
                      >
                        <IconoArchivar />
                        Archivar
                      </BotonEnviar>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {archivados.length > 0 && (
        <section className="portal-seccion">
          <details className="portal-archivados">
            <summary>
              <span className="portal-archivados-resumen">
                <IconoArchivar />
                Archivados
                <span className="portal-archivados-num">{archivados.length}</span>
              </span>
              <span className="portal-archivados-chevron" aria-hidden>
                <IconoChevron />
              </span>
            </summary>
            <ul className="portal-archivados-lista">
              {archivados.map((t) => (
                <li className="portal-archivado" key={t.id}>
                  <Link className="portal-archivado-cuerpo" href={`/reporte/${t.id}`}>
                    <span className="portal-archivado-titulo">{t.titulo}</span>
                    <span className="portal-archivado-meta mono">
                      {folio(t.num)} · {fechaCorta(t.created_at)}
                    </span>
                  </Link>
                  <form action={reactivarReportePortal}>
                    <input type="hidden" name="id" value={t.id} />
                    <BotonEnviar
                      className="portal-archivado-reactivar"
                      title="Regresar este reporte a tus reportes activos"
                      ocupado="Reactivando…"
                    >
                      Reactivar
                    </BotonEnviar>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

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
    </>
  );
}

function Bienvenida({ conError }: { conError: boolean }) {
  // Misma esencia que el login del panel y el Portal de Mantenimiento: fondo navy,
  // card del logo + eyebrow, y una tarjeta blanca con el formulario. Se conserva
  // el campo de correo fusionado, el botón Continuar y la nota "sin contraseñas".
  return (
    <div className="portal-acceso">
      <div className="login-col">
        <div className="login-marca">
          <span className="login-logo-card">
            <span className="logo-claro">
              <img
                src="/pimsa-logo.png"
                alt="Plásticos PIMSA · más que reciclaje, una visión a futuro"
              />
            </span>
          </span>
          <p className="eyebrow login-eyebrow">Plásticos PIMSA</p>
        </div>

        <form className="login-caja" action={entrarPortal}>
          <div className="login-caja-titulo">
            <h1>Soporte TI</h1>
            <p className="login-desc">
              ¿Problemas con tu computadora, el correo o algún programa? Escribe tu correo para
              reportarlo y dar seguimiento.
            </p>
          </div>

          {conError && <div className="login-error">Ese correo no se ve bien, revísalo.</div>}

          <div className="campo">
            <label htmlFor="bv-correo" className="portal-form-label">
              Tu correo de trabajo
            </label>
            <div className="portal-correo-campo">
              <input
                id="bv-correo"
                className="portal-correo-usuario"
                type="text"
                name="correo"
                placeholder="nombre.apellido"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="bv-dominio"
                required
                autoFocus
              />
              <span id="bv-dominio" className="portal-correo-dominio">
                @{DOMINIO_CORREO}
              </span>
            </div>
          </div>

          <BotonEnviar className="portal-boton press" ocupado="Un momento…">
            Continuar
            <IconoFlecha />
          </BotonEnviar>

          <p className="portal-nota">
            Sin contraseñas: tu correo solo se usa para mostrarte tus equipos y tus reportes.
          </p>
        </form>

        <p className="login-pie">Soporte TI · Plásticos PIMSA</p>
      </div>
    </div>
  );
}

function IconoCheck() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  );
}

function IconoArchivar() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconoChevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function IconoMensaje() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function IconoEquipo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M7 21h10" />
      <path d="M12 17v4" />
    </svg>
  );
}

function IconoBandeja() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

// Olas/flechas del isotipo PIMSA como marca de agua del hero (economía circular).
function Onda() {
  return (
    <svg
      className="portal-hero-onda"
      viewBox="225 75 440 245"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M250.8,161.3c-.86,2.68-1.62,5.28-2.51,7.83-5.24,15.06-8.97,30.44-8.55,46.5.43,16.45,5.19,31.18,18.1,42.41,5.26,4.58,11.66,5.45,18.19,5.71,13.18.52,25.46-3.18,37.16-8.8,24-11.54,46.52-25.69,69.29-39.4,37.86-22.81,74.77-47.12,112.02-70.91,12.96-8.28,26.46-15.55,40.44-21.95,21.3-9.74,42.23-7.91,62.87,2.08,11.97,5.79,22.51,13.37,30.14,24.55,4.15,6.09,6.78,12.76,7.95,20.01.17,1.07.57,2.41-.39,3.19-.95.78-1.83-.37-2.69-.72-13.11-5.36-25.95-3.3-38.68,1.38-14.02,5.15-25.81,14.1-37.8,22.63-45.51,32.4-92.72,62.06-141.56,89.18-19.99,11.1-40.15,21.79-61.89,29.16-18.21,6.17-36.78,10.4-56.15,9.57-19.52-.83-36.69-6.5-48.55-23.58-7.52-10.84-12.52-22.62-15.93-35.27-9.86-36.57-2.79-70.4,16.3-102.34.38-.64.71-1.34,2.24-1.23Z" />
      <path d="M644.57,197.77c3.19,31.78,2.53,62.97-15.53,90.96-11.66,18.06-28.94,27.54-49.82,31.36-29.04,5.31-53.55-4.3-75.62-22.28-12.87-10.49-25.31-21.49-37.58-32.68-2.24-2.04-2.36-3,.44-4.73,14.98-9.24,29.84-18.67,44.67-28.14,1.95-1.25,3.03-1.14,4.68.58,11.21,11.65,23.51,21.94,37.4,30.35,31,18.78,57.64,5.07,73.08-15.81,9.72-13.15,14.73-28.21,17.37-44.17.3-1.81.61-3.62.92-5.43Z" />
      <path d="M267.77,254.07c-7.95-2.4-12.69-7.59-15.44-14.39-6.95-17.17-8.3-34.87-3.38-52.82,4.24-15.47,11.01-29.68,21.91-41.71,14.67-16.19,34.33-21.08,54.84-13.45,17.26,6.42,31.72,17.26,45.55,29.04,11.81,10.05,22.7,21.05,33.07,32.58,1.92,2.14,1.94,3.08-.7,4.65-13.09,7.78-26.09,15.73-39.03,23.77-2.38,1.48-3.38,1.35-5.1-1.13-11.21-16.19-24.65-30.17-42.04-39.8-6.84-3.79-14.47-6.31-22.32-4.67-14.96,3.13-25.32,12.53-31.57,26.22-5.87,12.86-4.43,26.08-.44,39.16,1.23,4.04,2.91,7.95,4.62,12.54Z" />
    </svg>
  );
}
