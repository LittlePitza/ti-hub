import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabasePortal } from "@/lib/supabase";
import { getCorreoPortal, nombreDeCorreo, CATEGORIAS_PORTAL, ESTADO_PORTAL } from "@/lib/portal";
import { fechaCorta, folio } from "@/lib/format";
import Ruta from "@/components/Ruta";

export const dynamic = "force-dynamic";

const TITULO_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_PORTAL.map((c) => [c.valor, c.titulo]),
);

export default async function DetalleReporte({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const correo = await getCorreoPortal();
  if (!correo) redirect("/");

  const sb = getSupabasePortal();
  if (!sb) {
    return (
      <div className="vacio">
        <strong>Portal sin configurar</strong>
        Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en las variables de entorno del servidor.
      </div>
    );
  }

  // La service role key salta el RLS: filtrar SIEMPRE por el correo del empleado
  // para que nadie vea el reporte de alguien más cambiando el id de la URL.
  const { data: t } = await sb
    .from("tickets")
    .select("id, num, titulo, descripcion, categoria, estado, created_at, equipos(nombre, marca, modelo)")
    .eq("id", id)
    .eq("solicitante_email", correo)
    .maybeSingle();
  if (!t) notFound();

  const respuestasQ = await sb
    .from("ticket_eventos")
    .select("id, cuerpo, created_at")
    .eq("ticket_id", t.id)
    .eq("tipo", "respuesta")
    .order("created_at", { ascending: true });
  const respuestas = respuestasQ.data ?? [];

  const empleadoQ = await sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle();
  const nombre = empleadoQ.data?.nombre?.split(" ")[0] || nombreDeCorreo(correo);

  const estado = ESTADO_PORTAL[t.estado] ?? ESTADO_PORTAL.abierto;
  const equipo = Array.isArray(t.equipos) ? t.equipos[0] : t.equipos;
  const equipoTexto = equipo
    ? [equipo.nombre, [equipo.marca, equipo.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
    : null;

  return (
    <>
      <Link href="/" className="portal-volver">
        <IconoVolver />
        Mis reportes
      </Link>

      {/* Encabezado del expediente: folio, asunto y en qué paso va, de un vistazo. */}
      <section className="reporte-cabecera">
        <Onda />
        <div className="reporte-cabecera-top">
          <span className="reporte-folio mono">{folio(t.num)}</span>
          <span className={`insignia ${estado.tono}`}>{estado.texto}</span>
        </div>
        <h1 className="reporte-titulo">{t.titulo}</h1>
        <div className="reporte-cabecera-ruta">
          <Ruta paso={estado.paso} />
        </div>
      </section>

      {/* Detalles del reporte */}
      <section className="portal-seccion">
        <h2 className="portal-seccion-titulo">Detalles</h2>
        <dl className="reporte-datos">
          <div className="reporte-dato">
            <dt>Tipo de reporte</dt>
            <dd>{TITULO_CATEGORIA[t.categoria] ?? t.categoria}</dd>
          </div>
          <div className="reporte-dato">
            <dt>Lo reportaste</dt>
            <dd>{fechaCorta(t.created_at)}</dd>
          </div>
          {equipoTexto && (
            <div className="reporte-dato ancho">
              <dt>Equipo relacionado</dt>
              <dd>{equipoTexto}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Seguimiento: el hilo del reporte. Tu mensaje arriba como origen; debajo,
          cada respuesta que TI te ha enviado, en orden. */}
      <section className="portal-seccion">
        <h2 className="portal-seccion-titulo">Seguimiento</h2>
        <ol className="seguimiento">
          <li className="seg-item es-tuyo">
            <span className="seg-nodo" aria-hidden>{nombre.charAt(0).toUpperCase()}</span>
            <div className="seg-cuerpo">
              <div className="seg-cab">
                <strong>Tú abriste el reporte</strong>
                <span className="seg-fecha">{fechaCorta(t.created_at)}</span>
              </div>
              <div className="seg-burbuja tuyo">
                {t.descripcion || "Reportaste un problema y el equipo de TI lo recibió."}
              </div>
            </div>
          </li>

          {respuestas.map((r) => (
            <li className="seg-item es-ti" key={r.id}>
              <span className="seg-nodo" aria-hidden>
                <IconoSoporte />
              </span>
              <div className="seg-cuerpo">
                <div className="seg-cab">
                  <strong>Soporte TI te respondió</strong>
                  <span className="seg-fecha">{fechaCorta(r.created_at)}</span>
                </div>
                <div className="seg-burbuja ti">{r.cuerpo}</div>
              </div>
            </li>
          ))}

          {respuestas.length === 0 && estado.paso < 3 && (
            <li className="seg-item es-espera">
              <span className="seg-nodo" aria-hidden>
                <IconoReloj />
              </span>
              <div className="seg-cuerpo">
                <div className="seg-cab">
                  <strong>En la fila de TI</strong>
                </div>
                <div className="seg-espera">
                  Tu reporte ya está con el equipo de TI. Cuando te escriban una respuesta,
                  la verás aquí mismo.
                </div>
              </div>
            </li>
          )}

          {respuestas.length === 0 && estado.paso === 3 && (
            <li className="seg-item es-listo">
              <span className="seg-nodo" aria-hidden>
                <IconoCheck />
              </span>
              <div className="seg-cuerpo">
                <div className="seg-cab">
                  <strong>Reporte {estado.texto.toLowerCase()}</strong>
                </div>
                <div className="seg-espera">
                  TI cerró este reporte. Si el problema sigue, abre uno nuevo y lo retomamos.
                </div>
              </div>
            </li>
          )}
        </ol>
      </section>

      <Link href="/nuevo" className="reporte-cta-nuevo">
        ¿Otro problema? Reportarlo
        <IconoFlecha />
      </Link>
    </>
  );
}

function IconoVolver() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function IconoSoporte() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}

// Olas del isotipo PIMSA, marca de agua tenue del encabezado (economía circular).
function Onda() {
  return (
    <svg className="reporte-onda" viewBox="225 75 440 245" fill="currentColor" aria-hidden focusable="false">
      <path d="M250.8,161.3c-.86,2.68-1.62,5.28-2.51,7.83-5.24,15.06-8.97,30.44-8.55,46.5.43,16.45,5.19,31.18,18.1,42.41,5.26,4.58,11.66,5.45,18.19,5.71,13.18.52,25.46-3.18,37.16-8.8,24-11.54,46.52-25.69,69.29-39.4,37.86-22.81,74.77-47.12,112.02-70.91,12.96-8.28,26.46-15.55,40.44-21.95,21.3-9.74,42.23-7.91,62.87,2.08,11.97,5.79,22.51,13.37,30.14,24.55,4.15,6.09,6.78,12.76,7.95,20.01.17,1.07.57,2.41-.39,3.19-.95.78-1.83-.37-2.69-.72-13.11-5.36-25.95-3.3-38.68,1.38-14.02,5.15-25.81,14.1-37.8,22.63-45.51,32.4-92.72,62.06-141.56,89.18-19.99,11.1-40.15,21.79-61.89,29.16-18.21,6.17-36.78,10.4-56.15,9.57-19.52-.83-36.69-6.5-48.55-23.58-7.52-10.84-12.52-22.62-15.93-35.27-9.86-36.57-2.79-70.4,16.3-102.34.38-.64.71-1.34,2.24-1.23Z" />
      <path d="M644.57,197.77c3.19,31.78,2.53,62.97-15.53,90.96-11.66,18.06-28.94,27.54-49.82,31.36-29.04,5.31-53.55-4.3-75.62-22.28-12.87-10.49-25.31-21.49-37.58-32.68-2.24-2.04-2.36-3,.44-4.73,14.98-9.24,29.84-18.67,44.67-28.14,1.95-1.25,3.03-1.14,4.68.58,11.21,11.65,23.51,21.94,37.4,30.35,31,18.78,57.64,5.07,73.08-15.81,9.72-13.15,14.73-28.21,17.37-44.17.3-1.81.61-3.62.92-5.43Z" />
      <path d="M267.77,254.07c-7.95-2.4-12.69-7.59-15.44-14.39-6.95-17.17-8.3-34.87-3.38-52.82,4.24-15.47,11.01-29.68,21.91-41.71,14.67-16.19,34.33-21.08,54.84-13.45,17.26,6.42,31.72,17.26,45.55,29.04,11.81,10.05,22.7,21.05,33.07,32.58,1.92,2.14,1.94,3.08-.7,4.65-13.09,7.78-26.09,15.73-39.03,23.77-2.38,1.48-3.38,1.35-5.1-1.13-11.21-16.19-24.65-30.17-42.04-39.8-6.84-3.79-14.47-6.31-22.32-4.67-14.96,3.13-25.32,12.53-31.57,26.22-5.87,12.86-4.43,26.08-.44,39.16,1.23,4.04,2.91,7.95,4.62,12.54Z" />
    </svg>
  );
}
