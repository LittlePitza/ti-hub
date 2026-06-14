import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folio, duracion } from "@/lib/format";
import { ESTADOS_ACTIVOS, evaluarRespuesta, evaluarResolucion } from "@/lib/tickets";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import { Dona, Barras, type DatoGrafica } from "@/components/Graficas";

export const dynamic = "force-dynamic";

const TIPOS_EQUIPO: Record<string, string> = {
  laptop: "Laptops",
  desktop: "Desktops",
  monitor: "Monitores",
  impresora: "Impresoras",
  red: "Red",
  servidor: "Servidores",
  perifericos: "Periféricos",
  celular: "Celulares",
  tablet: "Tablets",
  linea: "Líneas telefónicas",
  software: "Software",
  otro: "Otro",
};

function contar<T>(lista: T[], llave: (x: T) => string): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const item of lista) mapa[llave(item)] = (mapa[llave(item)] ?? 0) + 1;
  return mapa;
}

// Color de la barra "real vs SLA": verde si cumplimos, ámbar si flaqueamos,
// rojo si vamos mal. El umbral 80% es el mismo que usa el resto del panel.
const colorPct = (pct: number | null) =>
  pct === null ? "var(--linea-fuerte)" : pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--aviso)" : "var(--critico)";

export default async function Resumen() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Resumen</h1>
        <p className="pagina-desc">Estado general del departamento</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const hoy = new Date().toISOString().slice(0, 10);
  const en14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const en90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const [equiposQ, ticketsQ, mantosQ] = await Promise.all([
    sb.from("equipos").select("nombre, tipo, estado, garantia_hasta"),
    sb.from("tickets").select("*").order("created_at", { ascending: false }),
    sb.from("mantenimientos").select("*").in("estado", ["programado", "en_proceso"])
      .lte("fecha_programada", en14)
      .order("fecha_programada", { ascending: true }),
  ]);

  const equipos = equiposQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const mantos = mantosQ.data ?? [];

  // Métricas
  const enReparacion = equipos.filter((e) => e.estado === "en_reparacion").length;
  const ticketsActivos = tickets.filter((t) => ESTADOS_ACTIVOS.includes(t.estado));
  const vencidos = mantos.filter((m) => m.fecha_programada < hoy);
  const proximos = mantos.filter((m) => m.fecha_programada >= hoy);

  // Métricas de atención (SLA)
  const ahora = Date.now();
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const conRespuesta = tickets.filter((t) => t.primera_respuesta_at);
  const tiemposRespuesta = conRespuesta.map((t) => evaluarRespuesta(t, ahora).ms);
  const respuestaEnSla = conRespuesta.filter((t) => evaluarRespuesta(t, ahora).semaforo === "cumplido").length;
  const pctRespuestaSla = conRespuesta.length
    ? Math.round((respuestaEnSla / conRespuesta.length) * 100)
    : null;

  const resueltosTk = tickets.filter((t) => t.resuelto_at);
  const tiemposResolucion = resueltosTk.map((t) => evaluarResolucion(t, ahora).ms);

  // Velocidad + calidad de atención, para el hero del resumen.
  const atendidos = conRespuesta.length;
  const resueltos = resueltosTk.length;
  const resolucionEnSla = resueltosTk.filter((t) => evaluarResolucion(t, ahora).semaforo === "cumplido").length;
  const pctResolucionSla = resueltos ? Math.round((resolucionEnSla / resueltos) * 100) : null;
  const promResolucion = tiemposResolucion.length ? duracion(promedio(tiemposResolucion)) : null;
  const promRespuesta = tiemposRespuesta.length ? duracion(promedio(tiemposRespuesta)) : null;

  const fueraDeSla = ticketsActivos.filter((t) => {
    const r = evaluarRespuesta(t, ahora);
    const s = evaluarResolucion(t, ahora);
    return r.semaforo === "incumplido" || s.semaforo === "incumplido";
  }).length;
  const porVencer = ticketsActivos.filter((t) => {
    const r = evaluarRespuesta(t, ahora);
    const s = evaluarResolucion(t, ahora);
    return r.semaforo === "por_vencer" || s.semaforo === "por_vencer";
  }).length;

  // Garantías por vencer en los próximos 90 días
  const garantias = equipos
    .filter((e) => e.estado !== "baja" && e.garantia_hasta && e.garantia_hasta >= hoy && e.garantia_hasta <= en90)
    .sort((a, b) => a.garantia_hasta!.localeCompare(b.garantia_hasta!));

  // Datos para gráficas
  const porEstadoTk = contar(tickets, (t) => t.estado);
  const ticketsPorEstado: DatoGrafica[] = [
    { label: "Abiertos", valor: porEstadoTk.abierto ?? 0, tono: "critico" },
    { label: "En proceso", valor: porEstadoTk.en_proceso ?? 0, tono: "aviso" },
    { label: "Resueltos", valor: porEstadoTk.resuelto ?? 0, tono: "ok" },
    { label: "Cerrados", valor: porEstadoTk.cerrado ?? 0, tono: "neutro" },
  ];

  const porPrioridad = contar(ticketsActivos, (t) => t.prioridad);
  const ticketsPorPrioridad: DatoGrafica[] = [
    { label: "Crítica", valor: porPrioridad.critica ?? 0, tono: "critico" },
    { label: "Alta", valor: porPrioridad.alta ?? 0, tono: "aviso" },
    { label: "Media", valor: porPrioridad.media ?? 0, tono: "info" },
    { label: "Baja", valor: porPrioridad.baja ?? 0, tono: "neutro" },
  ];

  const porTipo = contar(equipos, (e) => e.tipo);
  const equiposPorTipo: DatoGrafica[] = Object.keys(TIPOS_EQUIPO)
    .filter((t) => porTipo[t])
    .map((t) => ({ label: TIPOS_EQUIPO[t], valor: porTipo[t], tono: "info" }))
    .sort((a, b) => b.valor - a.valor);

  const porEstadoEq = contar(equipos, (e) => e.estado);
  const equiposPorEstado: DatoGrafica[] = [
    { label: "Activos", valor: porEstadoEq.activo ?? 0, tono: "ok" },
    { label: "En reparación", valor: porEstadoEq.en_reparacion ?? 0, tono: "aviso" },
    { label: "Almacén", valor: porEstadoEq.almacen ?? 0, tono: "neutro" },
    { label: "Baja", valor: porEstadoEq.baja ?? 0, tono: "critico" },
  ];

  const ultimosTickets = tickets.slice(0, 5);

  return (
    <>
      {head}

      {/* Hero: ¿cómo va la mesa de ayuda? Velocidad emparejada con calidad de SLA */}
      <section className="resumen-hero">
        <div className="resumen-hero-cab">
          <h2>Rendimiento de la mesa</h2>
          <Link href="/ti/tickets" className="hero-activos">
            <span className="hero-activos-num">{ticketsActivos.length}</span> activos ahora
          </Link>
        </div>
        <div className="resumen-hero-cuerpo">
          <div className="tiempo-metrica">
            <div className="tiempo-label">Tiempo de resolución</div>
            <div className="tiempo-valor">
              {promResolucion ?? "—"}
              {promResolucion && <span className="tiempo-unid">promedio</span>}
            </div>
            <div className="tiempo-track">
              <div
                className="tiempo-track-fill"
                style={{ width: `${pctResolucionSla ?? 0}%`, background: colorPct(pctResolucionSla) }}
              />
            </div>
            <div className="tiempo-pie">
              <span>{pctResolucionSla === null ? "Aún sin tickets resueltos" : <><b>{pctResolucionSla}%</b> dentro de SLA</>}</span>
              <span>{resueltos} {resueltos === 1 ? "resuelto" : "resueltos"}</span>
            </div>
          </div>
          <div className="tiempo-metrica">
            <div className="tiempo-label">Primera respuesta</div>
            <div className="tiempo-valor">
              {promRespuesta ?? "—"}
              {promRespuesta && <span className="tiempo-unid">promedio</span>}
            </div>
            <div className="tiempo-track">
              <div
                className="tiempo-track-fill"
                style={{ width: `${pctRespuestaSla ?? 0}%`, background: colorPct(pctRespuestaSla) }}
              />
            </div>
            <div className="tiempo-pie">
              <span>{pctRespuestaSla === null ? "Aún sin atender" : <><b>{pctRespuestaSla}%</b> dentro de SLA</>}</span>
              <span>{atendidos} {atendidos === 1 ? "atendido" : "atendidos"}</span>
            </div>
          </div>
        </div>
        <div className="resumen-hero-alertas">
          {fueraDeSla > 0 && (
            <Link href="/ti/tickets" className="chip-alerta critico">{fueraDeSla} fuera de SLA</Link>
          )}
          {porVencer > 0 && (
            <Link href="/ti/tickets" className="chip-alerta aviso">{porVencer} por vencer</Link>
          )}
          {fueraDeSla === 0 && porVencer === 0 && <span className="chip-ok">Todo dentro de SLA</span>}
        </div>
      </section>

      {/* Contexto operativo: activos físicos y trabajo programado */}
      <section className="banda-operativa">
        <h2 className="banda-titulo">Inventario y mantenimiento</h2>
        <div className="metricas">
          <div className="metrica">
            <div className="metrica-valor">{equipos.length}</div>
            <div className="metrica-label">Equipos en inventario</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${enReparacion > 0 ? "alerta" : ""}`}>{enReparacion}</div>
            <div className="metrica-label">En reparación</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${vencidos.length > 0 ? "alerta" : ""}`}>{vencidos.length}</div>
            <div className="metrica-label">Mantenimientos vencidos</div>
          </div>
          <div className="metrica">
            <div className="metrica-valor">{proximos.length}</div>
            <div className="metrica-label">Próximos 14 días</div>
          </div>
        </div>
      </section>

      <div className="dash-cols">
        {/* Columna principal: gráficas de distribución */}
        <div className="dash-main">
          <section>
            <h2 className="banda-titulo">Distribución</h2>
            <div className="tarjetas">
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Tickets por estado</h3>
                <Dona datos={ticketsPorEstado} unidad="tickets" />
              </div>
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Tickets activos por prioridad</h3>
                <Barras datos={ticketsPorPrioridad} />
              </div>
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Equipos por estado</h3>
                <Dona datos={equiposPorEstado} unidad="equipos" />
              </div>
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Equipos por tipo</h3>
                <Barras datos={equiposPorTipo} />
              </div>
            </div>
          </section>
        </div>

        {/* Columna de actividad */}
        <aside className="dash-aside">
          <div className="panel">
            <div className="panel-cab">
              <span className="panel-cab-titulo">Últimos tickets</span>
              <Link href="/ti/tickets">Ver todos</Link>
            </div>
            <div className="panel-cuerpo">
              {ultimosTickets.length === 0 ? (
                <div className="panel-vacio">Sin tickets registrados todavía.</div>
              ) : (
                ultimosTickets.map((t) => (
                  <div className="fila-compacta" key={t.id}>
                    <div className="fila-compacta-main">
                      <Link href={`/ti/tickets/${t.id}`} className="fila-compacta-titulo">{t.titulo}</Link>
                      <div className="fila-compacta-sub">
                        <span className="mono">{folio(t.num)}</span><span>·</span><span>{t.solicitante}</span>
                      </div>
                    </div>
                    <div className="fila-compacta-fin"><Insignia valor={t.estado} /></div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-cab">
              <span className="panel-cab-titulo">Próximos mantenimientos</span>
              <Link href="/ti/mantenimientos">Programar</Link>
            </div>
            <div className="panel-cuerpo">
              {mantos.length === 0 ? (
                <div className="panel-vacio">Nada en las próximas dos semanas.</div>
              ) : (
                mantos.map((m) => {
                  const vencido = m.fecha_programada < hoy;
                  return (
                    <div className="fila-compacta" key={m.id}>
                      <div className="fila-compacta-main">
                        <div className="fila-compacta-titulo">{m.titulo}</div>
                        <div className="fila-compacta-sub">
                          <span>{m.tipo}</span><span>·</span><span>{m.responsable ?? "Sin responsable"}</span>
                        </div>
                      </div>
                      <div className="fila-compacta-fin">
                        <div className={`fila-compacta-fecha ${vencido ? "fecha-vencida" : ""}`}>
                          {fechaCorta(m.fecha_programada)}
                        </div>
                        {vencido && <div className="fecha-vencida" style={{ fontSize: 11 }}>vencido</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {garantias.length > 0 && (
            <div className="panel">
              <div className="panel-cab">
                <span className="panel-cab-titulo">Garantías · 90 días</span>
                <Link href="/ti/inventario">Inventario</Link>
              </div>
              <div className="panel-cuerpo">
                {garantias.map((e) => {
                  const dias = Math.ceil((new Date(e.garantia_hasta! + "T12:00:00").getTime() - Date.now()) / 86400000);
                  return (
                    <div className="fila-compacta" key={e.nombre}>
                      <div className="fila-compacta-main">
                        <div className="fila-compacta-titulo">{e.nombre}</div>
                        <div className="fila-compacta-sub">{TIPOS_EQUIPO[e.tipo] ?? e.tipo}</div>
                      </div>
                      <div className="fila-compacta-fin">
                        <div className="fila-compacta-fecha">{fechaCorta(e.garantia_hasta)}</div>
                        <div className={dias <= 30 ? "fecha-vencida" : "suave"} style={{ fontSize: 11 }}>{dias} días</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
