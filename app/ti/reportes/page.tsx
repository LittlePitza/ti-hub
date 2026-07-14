import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { getConfigCorreo, resolverSla } from "@/lib/correo";
import { duracion, duracionPartes, fechaHora, folioIncidente } from "@/lib/format";
import { CATEGORIAS_TK, PRIORIDADES } from "@/lib/tickets";
import { etiquetaCriticidad, metaTipoIncidente, TIPOS_INCIDENTE } from "@/lib/servicios";
import {
  claveMes,
  esClaveMes,
  etiquetaMes,
  etiquetaMesCorta,
  mesVecino,
  ultimosMeses,
  reporteTickets,
  reporteIncidentes,
  reporteMantenimientos,
  serieMensual,
  serieMensualIncidentes,
  incidentesDelMes,
  tonoDisponibilidad,
  variacionPct,
  type TicketReporte,
  type IncidenteDetalle,
  type MantenimientoReporte,
} from "@/lib/reportes";
import SinConexion from "@/components/SinConexion";
import BotonImprimir from "@/components/BotonImprimir";
import { Dona, Barras, Columnas, type DatoGrafica, type PuntoColumnas } from "@/components/Graficas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes" };

// Etiquetas en lenguaje del panel para las distribuciones del mes.
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
const PRIORIDAD_TEXTO: Record<string, { label: string; tono: string }> = {
  critica: { label: "Crítica", tono: "critico" },
  alta: { label: "Alta", tono: "aviso" },
  media: { label: "Media", tono: "info" },
  baja: { label: "Baja", tono: "neutro" },
};

// Chip de variación contra el mes anterior. `buenoCuandoSube` decide el color:
// que suban los resueltos es bueno; que suba el tiempo de resolución, no.
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
  const tono = sube === buenoCuandoSube ? "bueno" : "malo";
  return (
    <span className={`kpi-delta ${tono}`}>
      {sube ? "▲" : "▼"} {Math.abs(variacion)}
      {sufijo}
    </span>
  );
}

// Duración con cifra grande y unidad chica (mismo tratamiento que el resumen).
function Duracion({ ms }: { ms: number | null }) {
  if (ms === null) return <>—</>;
  return (
    <>
      {duracionPartes(ms).map((p, i) => (
        <span className="tiempo-parte" key={i}>
          <span className="tiempo-cifra">{p.valor}</span>
          <span className="tiempo-u">{p.unidad}</span>
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

  const mesActual = claveMes(new Date());
  // Mes a reportar: el pedido si es válido y no es futuro; si no, el actual.
  const clave = esClaveMes(mes) && mes <= mesActual ? mes : mesActual;
  const enCurso = clave === mesActual;

  const head = (
    <div className="pagina-head no-print">
      <div>
        <h1 className="pagina-titulo">Reportes</h1>
        <p className="pagina-desc">Corte mensual para KPIs: tickets, SLA, sistemas y mantenimientos</p>
      </div>
      <div className="pagina-head-acciones">
        <nav className="selector-mes" aria-label="Elegir mes del reporte">
          <Link
            className="selector-mes-flecha no-print"
            href={`/ti/reportes?mes=${mesVecino(clave, -1)}`}
            aria-label="Mes anterior"
          >
            ‹
          </Link>
          <span className="selector-mes-etiqueta">
            {etiquetaMes(clave)}
            {enCurso && <em>en curso</em>}
          </span>
          {enCurso ? (
            <span className="selector-mes-flecha inactiva no-print" aria-hidden>
              ›
            </span>
          ) : (
            <Link
              className="selector-mes-flecha no-print"
              href={`/ti/reportes?mes=${mesVecino(clave, 1)}`}
              aria-label="Mes siguiente"
            >
              ›
            </Link>
          )}
        </nav>
        <BotonImprimir texto="Imprimir reporte" />
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const [ticketsQ, incidentesQ, serviciosQ, mantosQ, configCorreo] = await Promise.all([
    sb.from("tickets").select("estado, prioridad, categoria, created_at, primera_respuesta_at, resuelto_at"),
    sb.from("incidentes").select("num, servicio_id, titulo, tipo, estado, inicio, fin"),
    sb.from("servicios").select("id, nombre, criticidad"),
    sb.from("mantenimientos").select("tipo, estado, fecha_programada"),
    getConfigCorreo(sb),
  ]);

  const tickets = (ticketsQ.data ?? []) as TicketReporte[];
  const incidentes = (incidentesQ.data ?? []) as IncidenteDetalle[];
  const servicios = serviciosQ.data ?? [];
  const mantos = (mantosQ.data ?? []) as MantenimientoReporte[];

  const ahora = Date.now();
  const { sla, porVencerPct } = resolverSla(configCorreo);

  const rep = reporteTickets(tickets, clave, sla, porVencerPct, ahora);
  const repAnterior = reporteTickets(tickets, mesVecino(clave, -1), sla, porVencerPct, ahora);
  const inc = reporteIncidentes(incidentes, servicios, clave, ahora);
  const incAnterior = reporteIncidentes(incidentes, servicios, mesVecino(clave, -1), ahora);
  const manto = reporteMantenimientos(mantos, clave);
  const mantoAnterior = reporteMantenimientos(mantos, mesVecino(clave, -1));

  // Tendencia: los últimos 6 meses terminando en el mes reportado.
  const serie = serieMensual(tickets, ultimosMeses(clave, 6));
  const tendencia: PuntoColumnas[] = serie.map((p) => ({
    label: etiquetaMesCorta(p.clave),
    a: p.creados,
    b: p.resueltos,
  }));
  const tendenciaInc: PuntoColumnas[] = serieMensualIncidentes(incidentes, ultimosMeses(clave, 6)).map((p) => ({
    label: etiquetaMesCorta(p.clave),
    a: p.creados,
    b: p.resueltos,
  }));

  // Detalle de incidentes que pisaron el mes y nombre de su servicio.
  const detalleInc = incidentesDelMes(incidentes, clave, ahora);
  const nombreServicio = new Map(servicios.map((s) => [s.id, s.nombre]));

  // Diferencia en puntos porcentuales para los KPIs de SLA.
  const deltaPp = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

  const porCategoria: DatoGrafica[] = CATEGORIAS_TK.filter((c) => rep.porCategoria[c]).map((c) => ({
    label: CATEGORIA_TEXTO[c] ?? c,
    valor: rep.porCategoria[c],
    tono: CATEGORIA_TONO[c] ?? "neutro",
  }));
  const porPrioridad: DatoGrafica[] = PRIORIDADES.filter((p) => rep.porPrioridad[p]).map((p) => ({
    label: PRIORIDAD_TEXTO[p].label,
    valor: rep.porPrioridad[p],
    tono: PRIORIDAD_TEXTO[p].tono,
  }));
  const porTipoInc: DatoGrafica[] = TIPOS_INCIDENTE.filter((t) => inc.porTipo[t.valor]).map((t) => ({
    label: t.etiqueta,
    valor: inc.porTipo[t.valor],
    tono: t.tono,
  }));

  // Delta de disponibilidad en puntos porcentuales, redondeado a centésimas.
  const deltaDisponibilidad =
    inc.disponibilidadPromedio !== null && incAnterior.disponibilidadPromedio !== null
      ? Math.round((inc.disponibilidadPromedio - incAnterior.disponibilidadPromedio) * 100) / 100
      : null;
  const disponibilidadTexto = (pct: number) => (pct >= 99.995 ? "100" : pct.toFixed(2));

  // Disponibilidad del mes anterior por servicio, para el delta de la tabla
  // de tiempo operativo.
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
            {etiquetaMes(clave)}
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
          Mesa de ayuda · {etiquetaMes(clave)}
          {enCurso && <span className="seccion-nota"> (mes en curso, corte al día de hoy)</span>}
        </h2>
        <div className="metricas">
          <div className="metrica">
            <div className="metrica-valor">{rep.creados}</div>
            <div className="metrica-label">Tickets creados</div>
            <Delta variacion={variacionPct(rep.creados, repAnterior.creados)} buenoCuandoSube={false} />
          </div>
          <div className="metrica">
            <div className="metrica-valor">{rep.resueltos}</div>
            <div className="metrica-label">Tickets resueltos</div>
            <Delta variacion={variacionPct(rep.resueltos, repAnterior.resueltos)} buenoCuandoSube={true} />
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${rep.backlogCierre > 0 && rep.backlogCierre > rep.creados ? "alerta" : ""}`}>
              {rep.backlogCierre}
            </div>
            <div className="metrica-label">{enCurso ? "Abiertos hoy" : "Backlog al cierre"}</div>
            <Delta
              variacion={variacionPct(rep.backlogCierre, repAnterior.backlogCierre)}
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">{rep.respuesta.pct === null ? "—" : `${rep.respuesta.pct}%`}</div>
            <div className="metrica-label">Respuesta en SLA · {rep.respuesta.atendidos} atendidos</div>
            <Delta variacion={deltaPp(rep.respuesta.pct, repAnterior.respuesta.pct)} buenoCuandoSube={true} sufijo=" pp" />
          </div>
          <div className="metrica">
            <div className="metrica-valor">{rep.resolucion.pct === null ? "—" : `${rep.resolucion.pct}%`}</div>
            <div className="metrica-label">Resolución en SLA · {rep.resueltos} resueltos</div>
            <Delta variacion={deltaPp(rep.resolucion.pct, repAnterior.resolucion.pct)} buenoCuandoSube={true} sufijo=" pp" />
          </div>
          <div className="metrica">
            <div className="metrica-valor"><Duracion ms={rep.resolucion.promedioMs} /></div>
            <div className="metrica-label">Resolución promedio</div>
            <Delta
              variacion={
                rep.resolucion.promedioMs !== null && repAnterior.resolucion.promedioMs !== null
                  ? variacionPct(Math.round(rep.resolucion.promedioMs), Math.round(repAnterior.resolucion.promedioMs))
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
          <Columnas datos={tendencia} serieA="Creados" serieB="Resueltos" tonoA="info" tonoB="ok" />
        </div>
      </section>

      {/* Qué entró en el mes, por tipo y urgencia. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Distribución de lo creado en el mes</h2>
        <div className="tarjetas">
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Por categoría</h3>
            <Dona datos={porCategoria} unidad="tickets" />
          </div>
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Por prioridad</h3>
            <Barras datos={porPrioridad} />
          </div>
        </div>
      </section>

      {/* Estado de sistemas: qué se cayó, cuánto costó en tiempo y cómo va
          contra el mes anterior — mismo tratamiento que la mesa de ayuda. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Estado de sistemas · {etiquetaMes(clave)}</h2>
        <div className="metricas" style={{ marginBottom: 16 }}>
          <div className="metrica">
            <div className="metrica-valor">{inc.iniciados}</div>
            <div className="metrica-label">Incidentes iniciados</div>
            <Delta variacion={variacionPct(inc.iniciados, incAnterior.iniciados)} buenoCuandoSube={false} />
          </div>
          <div className="metrica">
            <div className="metrica-valor">{inc.resueltos}</div>
            <div className="metrica-label">Incidentes resueltos</div>
            <Delta variacion={variacionPct(inc.resueltos, incAnterior.resueltos)} buenoCuandoSube={true} />
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${inc.abiertosCierre > 0 ? "alerta" : ""}`}>{inc.abiertosCierre}</div>
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
                  ? variacionPct(Math.round(inc.msCaidaTotal), Math.round(incAnterior.msCaidaTotal))
                  : null
              }
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor"><Duracion ms={inc.mttrMs} /></div>
            <div className="metrica-label">Recuperación promedio (MTTR)</div>
            <Delta
              variacion={
                inc.mttrMs !== null && incAnterior.mttrMs !== null
                  ? variacionPct(Math.round(inc.mttrMs), Math.round(incAnterior.mttrMs))
                  : null
              }
              buenoCuandoSube={false}
            />
          </div>
          <div className="metrica">
            <div className="metrica-valor">
              {inc.disponibilidadPromedio === null ? "—" : `${disponibilidadTexto(inc.disponibilidadPromedio)}%`}
            </div>
            <div className="metrica-label">Disponibilidad promedio · {servicios.length} servicios</div>
            <Delta variacion={deltaDisponibilidad} buenoCuandoSube={true} sufijo=" pp" />
          </div>
        </div>

        <div className="tarjetas">
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Tendencia de incidentes · últimos 6 meses</h3>
            <Columnas datos={tendenciaInc} serieA="Iniciados" serieB="Resueltos" tonoA="aviso" tonoB="ok" />
          </div>
          <div className="tarjeta">
            <h3 className="tarjeta-titulo">Incidentes del mes por tipo</h3>
            <Dona datos={porTipoInc} unidad="incidentes" />
          </div>
        </div>

        {inc.porServicio.length === 0 ? (
          <div className="vacio">
            <strong>Sin afectaciones en {etiquetaMes(clave)}</strong>
            Ningún servicio registró incidentes que tocaran este mes.
          </div>
        ) : (
          <>
            <div className="tarjeta" style={{ padding: 0, marginBottom: 16 }}>
              <h3 className="tarjeta-titulo" style={{ padding: "16px 16px 0" }}>Afectación por servicio</h3>
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
                      <td>{etiquetaCriticidad(s.criticidad)}</td>
                      <td className="mono">{s.incidentes}</td>
                      <td>{s.msCaida > 0 ? duracion(s.msCaida) : "—"}</td>
                      <td>{s.msAfectado > 0 ? duracion(s.msAfectado) : "—"}</td>
                      <td>
                        <span className={`insignia ${tonoDisponibilidad(s.disponibilidad)}`}>
                          {disponibilidadTexto(s.disponibilidad)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tarjeta" style={{ padding: 0 }}>
              <h3 className="tarjeta-titulo" style={{ padding: "16px 16px 0" }}>Incidentes del mes</h3>
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
                    const tipo = metaTipoIncidente(i.tipo);
                    return (
                      <tr key={i.num}>
                        <td className="mono">{folioIncidente(i.num)}</td>
                        <td className="suave">{nombreServicio.get(i.servicio_id) ?? "—"}</td>
                        <td><div className="celda-principal">{i.titulo}</div></td>
                        <td><span className={`insignia ${tipo.tono}`}>{tipo.etiqueta}</span></td>
                        <td className="suave mono" style={{ whiteSpace: "nowrap" }}>{fechaHora(i.inicio)}</td>
                        <td className="mono">{duracion(i.msDuracion)}</td>
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
          Tiempo operativo por servicio · {etiquetaMes(clave)}
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
                      <td><div className="celda-principal">{s.nombre}</div></td>
                      <td>{etiquetaCriticidad(s.criticidad)}</td>
                      <td className="mono">{duracion(s.msOperativo)}</td>
                      <td className="mono">{s.msCaida > 0 ? duracion(s.msCaida) : "—"}</td>
                      <td>
                        <span className={`insignia ${tonoDisponibilidad(s.disponibilidad)}`}>
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
              Ventana de referencia: {duracion(inc.msVentana)}
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
            <Delta variacion={variacionPct(manto.completados, mantoAnterior.completados)} buenoCuandoSube={true} />
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
