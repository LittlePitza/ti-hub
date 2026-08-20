import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { getEmailConfig, resolveSla } from "@/lib/domain/email";
import { duration, durationParts, dateTime, incidentFolio } from "@/lib/utils/format";
import { TICKET_CATEGORIES, PRIORITIES } from "@/lib/domain/tickets";
import { criticalityLabel, incidentTypeMeta, INCIDENT_TYPES } from "@/lib/domain/services";
import {
  monthKey,
  isMonthKey,
  monthLabel,
  shortMonthLabel,
  adjacentMonth,
  recentMonths,
  ticketReport,
  incidentReport,
  maintenanceReport,
  monthlySeries,
  monthlyIncidentSeries,
  incidentsInMonth,
  availabilityTone,
  percentChange,
  type ReportTicket,
  type IncidentDetail,
  type ReportMaintenance,
} from "@/lib/domain/reports";
import NoConnection from "@/components/ui/NoConnection";
import PrintButton from "@/components/ui/PrintButton";
import {
  Donut,
  Bars,
  Columns,
  type ChartDatum,
  type ColumnPoint,
} from "@/components/charts/Charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes" };

// Panel-language labels for the month's breakdowns.
const CATEGORIA_TEXTO: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  red: "Red",
  accesos: "Accesos",
  correo: "Correo",
  otro: "Otro",
};
const CATEGORIA_TONO: Record<string, string> = {
  hardware: "info",
  software: "ok",
  red: "aviso",
  accesos: "critico",
  correo: "neutro",
  otro: "neutro",
};
const PRIORIDAD_TEXTO: Record<string, { label: string; tone: string }> = {
  critica: { label: "Crítica", tone: "critico" },
  alta: { label: "Alta", tone: "aviso" },
  media: { label: "Media", tone: "info" },
  baja: { label: "Baja", tone: "neutro" },
};

// Chip showing the change against the previous month. `buenoCuandoSube` decides
// the colour: more resolved tickets is good, a longer resolution time is not.
function Delta({
  variacion,
  buenoCuandoSube,
  sufijo = "%",
}: {
  variacion: number | null;
  buenoCuandoSube: boolean;
  sufijo?: string;
}) {
  if (variacion === null) return null;
  if (variacion === 0) return <span className="kpi-delta neutro">= igual</span>;
  const sube = variacion > 0;
  const tone = sube === buenoCuandoSube ? "bueno" : "malo";
  return (
    <span className={`kpi-delta ${tone}`}>
      {sube ? "▲" : "▼"} {Math.abs(variacion)}
      {sufijo}
    </span>
  );
}

// Duration with a large figure and a small unit (same treatment as the dashboard).
function Duracion({ ms }: { ms: number | null }) {
  if (ms === null) return <>—</>;
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

export default async function Reportes({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const sb = await getSupabase();

  const mesActual = monthKey(new Date());
  // Month to report: the requested one when valid and not in the future,
  // otherwise the current month.
  const clave = isMonthKey(mes) && mes <= mesActual ? mes : mesActual;
  const enCurso = clave === mesActual;

  const head = (
    <div className="pagina-head no-print">
      <div>
        <h1 className="pagina-titulo">Reportes</h1>
        <p className="pagina-desc">
          Corte mensual para KPIs: tickets, SLA, sistemas y mantenimientos
        </p>
      </div>
      <div className="pagina-head-acciones">
        <nav className="selector-mes" aria-label="Elegir mes del reporte">
          <Link
            className="selector-mes-flecha no-print"
            href={`/ti/reportes?mes=${adjacentMonth(clave, -1)}`}
            aria-label="Mes anterior"
          >
            ‹
          </Link>
          <span className="selector-mes-etiqueta">
            {monthLabel(clave)}
            {enCurso && <em>en curso</em>}
          </span>
          {enCurso ? (
            <span className="selector-mes-flecha inactiva no-print" aria-hidden>
              ›
            </span>
          ) : (
            <Link
              className="selector-mes-flecha no-print"
              href={`/ti/reportes?mes=${adjacentMonth(clave, 1)}`}
              aria-label="Mes siguiente"
            >
              ›
            </Link>
          )}
        </nav>
        <PrintButton text="Imprimir reporte" />
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

  const [ticketsQ, incidentesQ, serviciosQ, mantosQ, configCorreo] = await Promise.all([
    sb
      .from("tickets")
      .select("estado, prioridad, categoria, created_at, primera_respuesta_at, resuelto_at"),
    sb.from("incidentes").select("num, servicio_id, titulo, tipo, estado, inicio, fin"),
    sb.from("servicios").select("id, nombre, criticidad"),
    sb.from("mantenimientos").select("tipo, estado, fecha_programada"),
    getEmailConfig(sb),
  ]);

  const tickets = (ticketsQ.data ?? []) as ReportTicket[];
  const incidentes = (incidentesQ.data ?? []) as IncidentDetail[];
  const servicios = serviciosQ.data ?? [];
  const mantos = (mantosQ.data ?? []) as ReportMaintenance[];

  const ahora = Date.now();
  const { sla, porVencerPct } = resolveSla(configCorreo);

  const rep = ticketReport(tickets, clave, sla, porVencerPct, ahora);
  const repAnterior = ticketReport(tickets, adjacentMonth(clave, -1), sla, porVencerPct, ahora);
  const inc = incidentReport(incidentes, servicios, clave, ahora);
  const incAnterior = incidentReport(incidentes, servicios, adjacentMonth(clave, -1), ahora);
  const manto = maintenanceReport(mantos, clave);
  const mantoAnterior = maintenanceReport(mantos, adjacentMonth(clave, -1));

  // Trend: the last 6 months ending at the reported month.
  const serie = monthlySeries(tickets, recentMonths(clave, 6));
  const tendencia: ColumnPoint[] = serie.map((p) => ({
    label: shortMonthLabel(p.clave),
    a: p.creados,
    b: p.resueltos,
  }));
  const tendenciaInc: ColumnPoint[] = monthlyIncidentSeries(incidentes, recentMonths(clave, 6)).map(
    (p) => ({
      label: shortMonthLabel(p.clave),
      a: p.creados,
      b: p.resueltos,
    }),
  );

  // Detail of the incidents that overlapped the month, with their service name.
  const detalleInc = incidentsInMonth(incidentes, clave, ahora);
  const nombreServicio = new Map(servicios.map((s) => [s.id, s.nombre]));

  // Difference in percentage points for the SLA KPIs.
  const deltaPp = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

  const porCategoria: ChartDatum[] = TICKET_CATEGORIES.filter((c) => rep.porCategoria[c]).map(
    (c) => ({
      label: CATEGORIA_TEXTO[c] ?? c,
      value: rep.porCategoria[c],
      tone: CATEGORIA_TONO[c] ?? "neutro",
    }),
  );
  const porPrioridad: ChartDatum[] = PRIORITIES.filter((p) => rep.porPrioridad[p]).map((p) => ({
    label: PRIORIDAD_TEXTO[p].label,
    value: rep.porPrioridad[p],
    tone: PRIORIDAD_TEXTO[p].tone,
  }));
  const porTipoInc: ChartDatum[] = INCIDENT_TYPES.filter((t) => inc.porTipo[t.value]).map((t) => ({
    label: t.label,
    value: inc.porTipo[t.value],
    tone: t.tone,
  }));

  // Availability delta in percentage points, rounded to hundredths.
  const deltaDisponibilidad =
    inc.disponibilidadPromedio !== null && incAnterior.disponibilidadPromedio !== null
      ? Math.round((inc.disponibilidadPromedio - incAnterior.disponibilidadPromedio) * 100) / 100
      : null;
  const disponibilidadTexto = (pct: number) => (pct >= 99.995 ? "100" : pct.toFixed(2));

  // Previous month's availability per service, for the delta in the uptime table.
  const disponibilidadAnterior = new Map(
    incAnterior.disponibilidadPorServicio.map((s) => [s.servicioId, s.disponibilidad]),
  );

  return (
    <>
      {head}

      {/* Encabezado del documento: solo existe en el papel/PDF (.solo-print). */}
      <header className="solo-print reporte-impreso-head">
        <img src="/pimsa-logo.svg" alt="Plásticos PIMSA" />
        <div className="reporte-impreso-titulos">
          <strong>Reporte mensual de TI</strong>
          <span>
            {monthLabel(clave)}
            {enCurso && " · mes en curso, corte parcial"}
          </span>
        </div>
        <div className="reporte-impreso-meta">
          <span>Plásticos PIMSA · Departamento de Sistemas</span>
          <span>
            Generado el{" "}
            {new Date(ahora).toLocaleString("es-MX", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </header>

      {/* KPIs del mes, cada uno comparado contra el mes anterior. */}
      <section className="seccion">
        <h2 className="seccion-titulo">
          Mesa de ayuda · {monthLabel(clave)}
          {enCurso && <span className="seccion-nota"> (mes en curso, corte al día de hoy)</span>}
        </h2>
        <div className="metricas">
          <div className="metrica">
            <div className="metrica-valor">{rep.creados}</div>
            <div className="metrica-label">Tickets creados</div>
            <Delta
              variacion={percentChange(rep.creados, repAnterior.creados)}
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">{rep.resueltos}</div>
            <div className="metrica-label">Tickets resueltos</div>
            <Delta
              variacion={percentChange(rep.resueltos, repAnterior.resueltos)}
              buenoCuandoSube={true}
            />
          </div>
          <div className="metrica">
            <div
              className={`metrica-valor ${rep.backlogCierre > 0 && rep.backlogCierre > rep.creados ? "alerta" : ""}`}
            >
              {rep.backlogCierre}
            </div>
            <div className="metrica-label">{enCurso ? "Abiertos hoy" : "Backlog al cierre"}</div>
            <Delta
              variacion={percentChange(rep.backlogCierre, repAnterior.backlogCierre)}
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              {rep.respuesta.pct === null ? "—" : `${rep.respuesta.pct}%`}
            </div>
            <div className="metrica-label">
              Respuesta en SLA · {rep.respuesta.atendidos} atendidos
            </div>
            <Delta
              variacion={deltaPp(rep.respuesta.pct, repAnterior.respuesta.pct)}
              buenoCuandoSube={true}
              sufijo=" pp"
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              {rep.resolucion.pct === null ? "—" : `${rep.resolucion.pct}%`}
            </div>
            <div className="metrica-label">Resolución en SLA · {rep.resueltos} resueltos</div>
            <Delta
              variacion={deltaPp(rep.resolucion.pct, repAnterior.resolucion.pct)}
              buenoCuandoSube={true}
              sufijo=" pp"
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              <Duracion ms={rep.resolucion.promedioMs} />
            </div>
            <div className="metrica-label">Resolución promedio</div>
            <Delta
              variacion={
                rep.resolucion.promedioMs !== null && repAnterior.resolucion.promedioMs !== null
                  ? percentChange(
                      Math.round(rep.resolucion.promedioMs),
                      Math.round(repAnterior.resolucion.promedioMs),
                    )
                  : null
              }
              buenoCuandoSube={false}
            />
          </div>
        </div>
      </section>

      {/* Tendencia semestral: ¿la mesa desahoga lo que entra? */}
      <section className="seccion">
        <h2 className="seccion-titulo">Tendencia · últimos 6 meses</h2>
        <div className="tarjeta">
          <Columns datos={tendencia} serieA="Creados" serieB="Resueltos" tonoA="info" tonoB="ok" />
        </div>
      </section>

      {/* Qué entró en el mes, por tipo y urgencia. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Distribución de lo creado en el mes</h2>
        <div className="tarjetas">
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Por categoría</h3>
            <Donut datos={porCategoria} unit="tickets" />
          </div>
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Por prioridad</h3>
            <Bars datos={porPrioridad} />
          </div>
        </div>
      </section>

      {/* Estado de sistemas: qué se cayó, cuánto costó en tiempo y cómo va
          contra el mes anterior — mismo tratamiento que la mesa de ayuda. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Estado de sistemas · {monthLabel(clave)}</h2>
        <div className="metricas" style={{ marginBottom: 16 }}>
          <div className="metrica">
            <div className="metrica-valor">{inc.iniciados}</div>
            <div className="metrica-label">Incidentes iniciados</div>
            <Delta
              variacion={percentChange(inc.iniciados, incAnterior.iniciados)}
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">{inc.resueltos}</div>
            <div className="metrica-label">Incidentes resueltos</div>
            <Delta
              variacion={percentChange(inc.resueltos, incAnterior.resueltos)}
              buenoCuandoSube={true}
            />
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${inc.abiertosCierre > 0 ? "alerta" : ""}`}>
              {inc.abiertosCierre}
            </div>
            <div className="metrica-label">{enCurso ? "Abiertos hoy" : "Abiertos al cierre"}</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${inc.msCaidaTotal > 0 ? "alerta" : ""}`}>
              {inc.msCaidaTotal > 0 ? <Duracion ms={inc.msCaidaTotal} /> : "0"}
            </div>
            <div className="metrica-label">Tiempo en caída total</div>
            <Delta
              variacion={
                inc.msCaidaTotal > 0 && incAnterior.msCaidaTotal > 0
                  ? percentChange(
                      Math.round(inc.msCaidaTotal),
                      Math.round(incAnterior.msCaidaTotal),
                    )
                  : null
              }
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              <Duracion ms={inc.mttrMs} />
            </div>
            <div className="metrica-label">Recuperación promedio (MTTR)</div>
            <Delta
              variacion={
                inc.mttrMs !== null && incAnterior.mttrMs !== null
                  ? percentChange(Math.round(inc.mttrMs), Math.round(incAnterior.mttrMs))
                  : null
              }
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              {inc.disponibilidadPromedio === null
                ? "—"
                : `${disponibilidadTexto(inc.disponibilidadPromedio)}%`}
            </div>
            <div className="metrica-label">
              Disponibilidad promedio · {servicios.length} servicios
            </div>
            <Delta variacion={deltaDisponibilidad} buenoCuandoSube={true} sufijo=" pp" />
          </div>
        </div>

        <div className="tarjetas">
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Tendencia de incidentes · últimos 6 meses</h3>
            <Columns
              datos={tendenciaInc}
              serieA="Iniciados"
              serieB="Resueltos"
              tonoA="aviso"
              tonoB="ok"
            />
          </div>
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Incidentes del mes por tipo</h3>
            <Donut datos={porTipoInc} unit="incidentes" />
          </div>
        </div>

        {inc.porServicio.length === 0 ? (
          <div className="vacio">
            <strong>Sin afectaciones en {monthLabel(clave)}</strong>
            Ningún servicio registró incidentes que tocaran este mes.
          </div>
        ) : (
          <>
            <div className="tarjeta" style={{ padding: 0, marginBottom: 16 }}>
              <h3 className="tarjeta-titulo" style={{ padding: "16px 16px 0" }}>
                Afectación por servicio
              </h3>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Criticidad</th>
                    <th>Incidentes</th>
                    <th>Caída total</th>
                    <th>Tiempo afectado</th>
                    <th>Disponibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {inc.porServicio.map((s) => (
                    <tr key={s.servicioId}>
                      <td>{s.nombre}</td>
                      <td>{criticalityLabel(s.criticidad)}</td>
                      <td className="mono">{s.incidentes}</td>
                      <td>{s.msCaida > 0 ? duration(s.msCaida) : "—"}</td>
                      <td>{s.msAfectado > 0 ? duration(s.msAfectado) : "—"}</td>
                      <td>
                        <span className={`insignia ${availabilityTone(s.disponibilidad)}`}>
                          {disponibilidadTexto(s.disponibilidad)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tarjeta" style={{ padding: 0 }}>
              <h3 className="tarjeta-titulo" style={{ padding: "16px 16px 0" }}>
                Incidentes del mes
              </h3>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Servicio</th>
                    <th>Incidente</th>
                    <th>Tipo</th>
                    <th>Comenzó</th>
                    <th>Duración</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalleInc.map((i) => {
                    const tipo = incidentTypeMeta(i.tipo);
                    return (
                      <tr key={i.num}>
                        <td className="mono">{incidentFolio(i.num)}</td>
                        <td className="suave">{nombreServicio.get(i.servicio_id) ?? "—"}</td>
                        <td>
                          <div className="celda-principal">{i.titulo}</div>
                        </td>
                        <td>
                          <span className={`insignia ${tipo.tone}`}>{tipo.label}</span>
                        </td>
                        <td className="suave mono" style={{ whiteSpace: "nowrap" }}>
                          {dateTime(i.inicio)}
                        </td>
                        <td className="mono">{duration(i.msDuracion)}</td>
                        <td>
                          {i.abierto ? (
                            <span className="insignia critico">Abierto</span>
                          ) : (
                            <span className="insignia ok">Resuelto</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Tiempo operativo por servicio: el corte de disponibilidad que se
          entrega aparte como KPI, sobre TODO el catálogo (también los servicios
          sin incidentes). En papel arranca en hoja nueva para poderse separar. */}
      <section className="seccion hoja-aparte">
        <h2 className="seccion-titulo">
          Tiempo operativo por servicio · {monthLabel(clave)}
          {enCurso && <span className="seccion-nota"> (mes en curso, corte al día de hoy)</span>}
        </h2>
        {inc.disponibilidadPorServicio.length === 0 ? (
          <div className="vacio">
            <strong>Sin servicios monitoreados</strong>
            Da de alta los servicios en Estado de sistemas para medir su tiempo operativo.
          </div>
        ) : (
          <div className="tarjeta" style={{ padding: 0 }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Criticidad</th>
                  <th>Tiempo operativo</th>
                  <th>Caída total</th>
                  <th>Disponibilidad</th>
                  <th>vs mes anterior</th>
                </tr>
              </thead>
              <tbody>
                {inc.disponibilidadPorServicio.map((s) => {
                  const anterior = disponibilidadAnterior.get(s.servicioId);
                  return (
                    <tr key={s.servicioId}>
                      <td>
                        <div className="celda-principal">{s.nombre}</div>
                      </td>
                      <td>{criticalityLabel(s.criticidad)}</td>
                      <td className="mono">{duration(s.msOperativo)}</td>
                      <td className="mono">{s.msCaida > 0 ? duration(s.msCaida) : "—"}</td>
                      <td>
                        <span className={`insignia ${availabilityTone(s.disponibilidad)}`}>
                          {disponibilidadTexto(s.disponibilidad)}%
                        </span>
                      </td>
                      <td>
                        <Delta
                          variacion={
                            anterior === undefined
                              ? null
                              : Math.round((s.disponibilidad - anterior) * 100) / 100
                          }
                          buenoCuandoSube={true}
                          sufijo=" pp"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="tabla-nota">
              Ventana de referencia: {duration(inc.msVentana)}
              {enCurso ? " transcurridas del mes al momento del corte" : " (mes completo)"}. El
              tiempo operativo descuenta solo caídas totales; degradaciones y ventanas de
              mantenimiento no restan disponibilidad.
            </p>
          </div>
        )}
      </section>

      {/* Mantenimientos del mes: lo planeado contra lo hecho. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Mantenimientos programados en el mes</h2>
        <div className="metricas compacta">
          <div className="metrica">
            <div className="metrica-valor">{manto.programados}</div>
            <div className="metrica-label">
              Programados · {manto.preventivos} prev. / {manto.correctivos} corr.
            </div>
          </div>
          <div className="metrica">
            <div className="metrica-valor">{manto.completados}</div>
            <div className="metrica-label">Completados</div>
            <Delta
              variacion={percentChange(manto.completados, mantoAnterior.completados)}
              buenoCuandoSube={true}
            />
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${manto.pendientes > 0 && !enCurso ? "alerta" : ""}`}>
              {manto.pendientes}
            </div>
            <div className="metrica-label">{enCurso ? "Pendientes" : "Quedaron pendientes"}</div>
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              {manto.cumplimientoPct === null ? "—" : `${manto.cumplimientoPct}%`}
            </div>
            <div className="metrica-label">
              Cumplimiento{manto.cancelados > 0 ? ` · ${manto.cancelados} cancelados` : ""}
            </div>
            <Delta
              variacion={deltaPp(manto.cumplimientoPct, mantoAnterior.cumplimientoPct)}
              buenoCuandoSube={true}
              sufijo=" pp"
            />
          </div>
        </div>
      </section>

      {/* Pie del documento: solo existe en el papel/PDF. */}
      <footer className="solo-print reporte-impreso-pie">
        TI Hub · Plásticos PIMSA — reporte derivado de los registros del panel de TI.
        {enCurso && " El mes en curso corta al momento de generación."}
      </footer>
    </>
  );
}
