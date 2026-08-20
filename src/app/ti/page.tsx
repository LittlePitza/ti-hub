import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { shortDate, ticketFolio, durationParts, currency } from "@/lib/utils/format";
import { evaluateResponse, evaluateResolution, isActiveStatus } from "@/lib/domain/tickets";
import { paymentSchedule, monthOutstanding, formatTotals, todayISO } from "@/lib/domain/invoices";
import { servicesWithStatus, type Service, type Incident } from "@/lib/domain/services";
import { getEmailConfig, resolveSla } from "@/lib/domain/email";
import Badge from "@/components/ui/Badge";
import NoConnection from "@/components/ui/NoConnection";
import { Donut, Bars, type ChartDatum } from "@/components/charts/Charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumen" };

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

function countBy<T>(lista: T[], llave: (x: T) => string): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const item of lista) mapa[llave(item)] = (mapa[llave(item)] ?? 0) + 1;
  return mapa;
}

// Colour of the "actual vs SLA" bar: green when we are meeting it, amber when we
// are slipping, red when we are not. The 80% threshold is the same one the rest
// of the panel uses.
const colorPct = (pct: number | null) =>
  pct === null
    ? "var(--linea-fuerte)"
    : pct >= 80
      ? "var(--ok)"
      : pct >= 50
        ? "var(--aviso)"
        : "var(--critico)";

// Renders a duration with a large figure and a small unit tight against it
// ("3d 5h"), instead of a monospace string whose gaps pull it apart.
function Duracion({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="tiempo-cifra apagado">—</span>;
  return (
    <>
      {durationParts(ms).map((p, i) => (
        <span className="tiempo-parte" key={i}>
          <span className="tiempo-cifra">{p.value}</span>
          <span className="tiempo-u">{p.unit}</span>
        </span>
      ))}
    </>
  );
}

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
  if (!sb)
    return (
      <>
        {head}
        <NoConnection />
      </>
    );

  const hoy = new Date().toISOString().slice(0, 10);
  const en14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const en90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const [
    equiposQ,
    ticketsQ,
    mantosQ,
    respQ,
    configCorreo,
    facturasQ,
    provsQ,
    serviciosQ,
    incidentesQ,
  ] = await Promise.all([
    sb.from("equipos").select("nombre, tipo, estado, garantia_hasta"),
    sb
      .from("tickets")
      .select(
        "id, num, titulo, solicitante, estado, prioridad, asignado_a, created_at, primera_respuesta_at, resuelto_at",
      )
      .order("created_at", { ascending: false }),
    sb
      .from("mantenimientos")
      .select("id, titulo, tipo, responsable, fecha_programada, estado")
      .in("estado", ["programado", "en_proceso"])
      .lte("fecha_programada", en14)
      .order("fecha_programada", { ascending: true }),
    sb.from("responsivas").select("estado").in("estado", ["borrador", "pendiente_firma"]),
    getEmailConfig(sb),
    sb
      .from("facturas")
      .select("id, num, concepto, monto, moneda, estado, fecha_vencimiento, proveedor_id")
      .eq("estado", "pendiente"),
    sb
      .from("proveedores")
      .select("id, nombre, servicio, costo, moneda, periodicidad, proximo_pago, activo")
      .eq("activo", true),
    sb.from("servicios").select("*").eq("activo", true),
    sb.from("incidentes").select("*").neq("estado", "resuelto"),
  ]);

  const equipos = equiposQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const mantos = mantosQ.data ?? [];
  const respPendientes = (respQ.data ?? []).length;

  // Payment schedule (pending invoices plus recurrences): the next 60 days.
  const pagos = paymentSchedule(facturasQ.data ?? [], provsQ.data ?? [], todayISO(), 60);
  const pagosProximos = pagos.slice(0, 5);
  const pendienteMes = monthOutstanding(pagos, todayISO());

  // Metrics
  const enReparacion = equipos.filter((e) => e.estado === "en_reparacion").length;
  const ticketsActivos = tickets.filter((t) => isActiveStatus(t.estado));
  const vencidos = mantos.filter((m) => m.fecha_programada < hoy);
  const proximos = mantos.filter((m) => m.fecha_programada >= hoy);

  // Service metrics (SLA)
  const ahora = Date.now();
  const { sla, porVencerPct } = resolveSla(configCorreo);
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const conRespuesta = tickets.filter((t) => t.primera_respuesta_at);
  const tiemposRespuesta = conRespuesta.map(
    (t) => evaluateResponse(t, ahora, sla, porVencerPct).ms,
  );
  const respuestaEnSla = conRespuesta.filter(
    (t) => evaluateResponse(t, ahora, sla, porVencerPct).slaStatus === "cumplido",
  ).length;
  const pctRespuestaSla = conRespuesta.length
    ? Math.round((respuestaEnSla / conRespuesta.length) * 100)
    : null;

  const resueltosTk = tickets.filter((t) => t.resuelto_at);
  const tiemposResolucion = resueltosTk.map(
    (t) => evaluateResolution(t, ahora, sla, porVencerPct).ms,
  );

  // Speed and quality of service, for the dashboard hero.
  const atendidos = conRespuesta.length;
  const resueltos = resueltosTk.length;
  const resolucionEnSla = resueltosTk.filter(
    (t) => evaluateResolution(t, ahora, sla, porVencerPct).slaStatus === "cumplido",
  ).length;
  const pctResolucionSla = resueltos ? Math.round((resolucionEnSla / resueltos) * 100) : null;
  const msResolucion = tiemposResolucion.length ? promedio(tiemposResolucion) : null;
  const msRespuesta = tiemposRespuesta.length ? promedio(tiemposRespuesta) : null;
  const sinAsignar = ticketsActivos.filter((t) => !t.asignado_a).length;

  const fueraDeSla = ticketsActivos.filter((t) => {
    const r = evaluateResponse(t, ahora, sla, porVencerPct);
    const s = evaluateResolution(t, ahora, sla, porVencerPct);
    return r.slaStatus === "incumplido" || s.slaStatus === "incumplido";
  }).length;
  const porVencer = ticketsActivos.filter((t) => {
    const r = evaluateResponse(t, ahora, sla, porVencerPct);
    const s = evaluateResolution(t, ahora, sla, porVencerPct);
    return r.slaStatus === "por_vencer" || s.slaStatus === "por_vencer";
  }).length;

  // Systems status: services with open incidents (worst first).
  const serviciosAfectados = servicesWithStatus(
    (serviciosQ.data ?? []) as Service[],
    (incidentesQ.data ?? []) as Incident[],
  ).filter((s) => s.estado.value !== "operativo");

  // Warranties expiring in the next 90 days
  const garantias = equipos
    .filter(
      (e) =>
        e.estado !== "baja" &&
        e.garantia_hasta &&
        e.garantia_hasta >= hoy &&
        e.garantia_hasta <= en90,
    )
    .sort((a, b) => a.garantia_hasta!.localeCompare(b.garantia_hasta!));

  // Chart data
  const porEstadoTk = countBy(tickets, (t) => t.estado);
  const ticketsPorEstado: ChartDatum[] = [
    { label: "Abiertos", value: porEstadoTk.abierto ?? 0, tone: "critico" },
    { label: "En proceso", value: porEstadoTk.en_proceso ?? 0, tone: "aviso" },
    { label: "Resueltos", value: porEstadoTk.resuelto ?? 0, tone: "ok" },
    { label: "Cerrados", value: porEstadoTk.cerrado ?? 0, tone: "neutro" },
  ];

  const porPrioridad = countBy(ticketsActivos, (t) => t.prioridad);
  const ticketsPorPrioridad: ChartDatum[] = [
    { label: "Crítica", value: porPrioridad.critica ?? 0, tone: "critico" },
    { label: "Alta", value: porPrioridad.alta ?? 0, tone: "aviso" },
    { label: "Media", value: porPrioridad.media ?? 0, tone: "info" },
    { label: "Baja", value: porPrioridad.baja ?? 0, tone: "neutro" },
  ];

  const porTipo = countBy(equipos, (e) => e.tipo);
  const equiposPorTipo: ChartDatum[] = Object.keys(TIPOS_EQUIPO)
    .filter((t) => porTipo[t])
    .map((t) => ({ label: TIPOS_EQUIPO[t], value: porTipo[t], tone: "info" }))
    .sort((a, b) => b.value - a.value);

  const porEstadoEq = countBy(equipos, (e) => e.estado);
  const equiposPorEstado: ChartDatum[] = [
    { label: "Activos", value: porEstadoEq.activo ?? 0, tone: "ok" },
    { label: "En reparación", value: porEstadoEq.en_reparacion ?? 0, tone: "aviso" },
    { label: "Almacén", value: porEstadoEq.almacen ?? 0, tone: "neutro" },
    { label: "Baja", value: porEstadoEq.baja ?? 0, tone: "critico" },
  ];

  const ultimosTickets = tickets.slice(0, 5);

  return (
    <>
      {head}

      {/* Hero: ¿cómo va la mesa de ayuda? Velocidad (tiempo promedio) emparejada
          con calidad (% dentro de SLA), más la carga viva de la bandeja. */}
      <section className="resumen-hero">
        <div className="resumen-hero-cab">
          <h2>Rendimiento de la mesa</h2>
          <span className="resumen-hero-sub">Promedios de atención · SLA en vivo</span>
        </div>
        <div className="resumen-hero-cuerpo">
          <div className="tiempo-metrica destacada">
            <div className="tiempo-label">Resolución promedio</div>
            <div className="tiempo-valor">
              <Duracion ms={msResolucion} />
            </div>
            <div className="tiempo-track">
              <div
                className="tiempo-track-fill"
                style={{
                  width: `${pctResolucionSla ?? 0}%`,
                  background: colorPct(pctResolucionSla),
                }}
              />
            </div>
            <div className="tiempo-pie">
              <span>
                {pctResolucionSla === null ? (
                  "Aún sin tickets resueltos"
                ) : (
                  <>
                    <b>{pctResolucionSla}%</b> dentro de SLA
                  </>
                )}
              </span>
              <span>
                {resueltos} {resueltos === 1 ? "resuelto" : "resueltos"}
              </span>
            </div>
          </div>
          <div className="tiempo-metrica">
            <div className="tiempo-label">Primera respuesta</div>
            <div className="tiempo-valor">
              <Duracion ms={msRespuesta} />
            </div>
            <div className="tiempo-track">
              <div
                className="tiempo-track-fill"
                style={{ width: `${pctRespuestaSla ?? 0}%`, background: colorPct(pctRespuestaSla) }}
              />
            </div>
            <div className="tiempo-pie">
              <span>
                {pctRespuestaSla === null ? (
                  "Aún sin atender"
                ) : (
                  <>
                    <b>{pctRespuestaSla}%</b> dentro de SLA
                  </>
                )}
              </span>
              <span>
                {atendidos} {atendidos === 1 ? "atendido" : "atendidos"}
              </span>
            </div>
          </div>
          <Link href="/ti/tickets" className="tiempo-metrica carga-metrica">
            <div className="tiempo-label">Carga de la mesa</div>
            <div className="tiempo-valor">
              <span className="tiempo-parte">
                <span className="tiempo-cifra">{ticketsActivos.length}</span>
                <span className="tiempo-u">activos</span>
              </span>
            </div>
            <ul className="carga-lista">
              <li className={fueraDeSla > 0 ? "mal" : ""}>
                <span>Fuera de SLA</span>
                <b>{fueraDeSla}</b>
              </li>
              <li className={porVencer > 0 ? "ojo" : ""}>
                <span>Por vencer</span>
                <b>{porVencer}</b>
              </li>
              <li className={sinAsignar > 0 ? "ojo" : ""}>
                <span>Sin asignar</span>
                <b>{sinAsignar}</b>
              </li>
            </ul>
          </Link>
        </div>
      </section>

      {/* Contexto operativo: activos físicos, trabajo programado y pagos */}
      <section className="banda-operativa">
        <h2 className="banda-titulo">Inventario, mantenimiento y pagos</h2>
        <div className="metricas">
          <div className="metrica">
            <div className="metrica-valor">{equipos.length}</div>
            <div className="metrica-label">Equipos en inventario</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${enReparacion > 0 ? "alerta" : ""}`}>
              {enReparacion}
            </div>
            <div className="metrica-label">En reparación</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${vencidos.length > 0 ? "alerta" : ""}`}>
              {vencidos.length}
            </div>
            <div className="metrica-label">Mantenimientos vencidos</div>
          </div>
          <div className="metrica">
            <div className="metrica-valor">{proximos.length}</div>
            <div className="metrica-label">Próximos 14 días</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${respPendientes > 0 ? "alerta" : ""}`}>
              {respPendientes}
            </div>
            <div className="metrica-label">Responsivas sin firmar</div>
          </div>
          <div className="metrica">
            <div className="metrica-valor">{formatTotals(pendienteMes)}</div>
            <div className="metrica-label">Pagos pendientes del mes</div>
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
                <Donut datos={ticketsPorEstado} unit="tickets" />
              </div>
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Tickets activos por prioridad</h3>
                <Bars datos={ticketsPorPrioridad} />
              </div>
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Equipos por estado</h3>
                <Donut datos={equiposPorEstado} unit="equipos" />
              </div>
              <div className="tarjeta">
                <h3 className="tarjeta-titulo">Equipos por tipo</h3>
                <Bars datos={equiposPorTipo} />
              </div>
            </div>
          </section>
        </div>

        {/* Columna de actividad */}
        <aside className="dash-aside">
          {serviciosAfectados.length > 0 && (
            <div className="panel">
              <div className="panel-cab">
                <span className="panel-cab-titulo">Sistemas con problemas</span>
                <Link href="/ti/servicios">Ver estado</Link>
              </div>
              <div className="panel-cuerpo">
                {serviciosAfectados.map((s) => (
                  <div className="fila-compacta" key={s.servicio.id}>
                    <div className="fila-compacta-main">
                      <div className="fila-compacta-titulo">
                        <span
                          className={`estado-punto ${s.estado.tone}`}
                          aria-hidden
                          style={{ marginRight: 7 }}
                        />
                        {s.servicio.nombre}
                      </div>
                      {s.incidentesAbiertos[0] && (
                        <div className="fila-compacta-sub">{s.incidentesAbiertos[0].titulo}</div>
                      )}
                    </div>
                    <div className="fila-compacta-fin">
                      <span className={`insignia ${s.estado.tone}`}>{s.estado.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      <Link href={`/ti/tickets/${t.id}`} className="fila-compacta-titulo">
                        {t.titulo}
                      </Link>
                      <div className="fila-compacta-sub">
                        <span className="mono">{ticketFolio(t.num)}</span>
                        <span>·</span>
                        <span>{t.solicitante}</span>
                      </div>
                    </div>
                    <div className="fila-compacta-fin">
                      <Badge value={t.estado} />
                    </div>
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
                          <span>{m.tipo}</span>
                          <span>·</span>
                          <span>{m.responsable ?? "Sin responsable"}</span>
                        </div>
                      </div>
                      <div className="fila-compacta-fin">
                        <div className={`fila-compacta-fecha ${vencido ? "fecha-vencida" : ""}`}>
                          {shortDate(m.fecha_programada)}
                        </div>
                        {vencido && (
                          <div className="fecha-vencida" style={{ fontSize: 11 }}>
                            vencido
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-cab">
              <span className="panel-cab-titulo">Pagos próximos</span>
              <Link href="/ti/facturas">Ver todos</Link>
            </div>
            <div className="panel-cuerpo">
              {pagosProximos.length === 0 ? (
                <div className="panel-vacio">Sin pagos en los próximos 60 días.</div>
              ) : (
                pagosProximos.map((v, i) => (
                  <div className="fila-compacta" key={`${v.refId}-${v.fecha}-${i}`}>
                    <div className="fila-compacta-main">
                      <div className="fila-compacta-titulo">{v.titulo}</div>
                      <div className="fila-compacta-sub">
                        <span>{v.origen === "factura" ? "factura" : "recurrente"}</span>
                        <span>·</span>
                        <span>
                          {v.monto === null ? "monto variable" : currency(v.monto, v.moneda)}
                        </span>
                      </div>
                    </div>
                    <div className="fila-compacta-fin">
                      <div className={`fila-compacta-fecha ${v.vencido ? "fecha-vencida" : ""}`}>
                        {shortDate(v.fecha)}
                      </div>
                      {v.vencido && (
                        <div className="fecha-vencida" style={{ fontSize: 11 }}>
                          vencido
                        </div>
                      )}
                    </div>
                  </div>
                ))
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
                  const dias = Math.ceil(
                    (new Date(e.garantia_hasta! + "T12:00:00").getTime() - Date.now()) / 86400000,
                  );
                  return (
                    <div className="fila-compacta" key={e.nombre}>
                      <div className="fila-compacta-main">
                        <div className="fila-compacta-titulo">{e.nombre}</div>
                        <div className="fila-compacta-sub">{TIPOS_EQUIPO[e.tipo] ?? e.tipo}</div>
                      </div>
                      <div className="fila-compacta-fin">
                        <div className="fila-compacta-fecha">{shortDate(e.garantia_hasta)}</div>
                        <div
                          className={dias <= 30 ? "fecha-vencida" : "suave"}
                          style={{ fontSize: 11 }}
                        >
                          {dias} días
                        </div>
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
