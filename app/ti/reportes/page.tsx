import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { getConfigCorreo, resolverSla } from "@/lib/correo";
import { duracion, duracionPartes } from "@/lib/format";
import { CATEGORIAS_TK, PRIORIDADES } from "@/lib/tickets";
import { etiquetaCriticidad } from "@/lib/servicios";
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
  tonoDisponibilidad,
  variacionPct,
  type TicketReporte,
  type IncidenteReporte,
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
    <div className="pagina-head">
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
    sb.from("incidentes").select("servicio_id, tipo, estado, inicio, fin"),
    sb.from("servicios").select("id, nombre, criticidad"),
    sb.from("mantenimientos").select("tipo, estado, fecha_programada"),
    getConfigCorreo(sb),
  ]);

  const tickets = (ticketsQ.data ?? []) as TicketReporte[];
  const incidentes = (incidentesQ.data ?? []) as IncidenteReporte[];
  const servicios = serviciosQ.data ?? [];
  const mantos = (mantosQ.data ?? []) as MantenimientoReporte[];

  const ahora = Date.now();
  const { sla, porVencerPct } = resolverSla(configCorreo);

  const rep = reporteTickets(tickets, clave, sla, porVencerPct, ahora);
  const repAnterior = reporteTickets(tickets, mesVecino(clave, -1), sla, porVencerPct, ahora);
  const inc = reporteIncidentes(incidentes, servicios, clave, ahora);
  const manto = reporteMantenimientos(mantos, clave);

  // Tendencia: los últimos 6 meses terminando en el mes reportado.
  const serie = serieMensual(tickets, ultimosMeses(clave, 6));
  const tendencia: PuntoColumnas[] = serie.map((p) => ({
    label: etiquetaMesCorta(p.clave),
    a: p.creados,
    b: p.resueltos,
  }));

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

  return (
    <>
      {head}

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

      {/* Estado de sistemas: qué se cayó y cuánto costó en tiempo. */}
      <section className="seccion">
        <h2 className="seccion-titulo">Estado de sistemas</h2>
        <div className="metricas compacta" style={{ marginBottom: 16 }}>
          <div className="metrica">
            <div className="metrica-valor">{inc.iniciados}</div>
            <div className="metrica-label">Incidentes iniciados</div>
          </div>
          <div className="metrica">
            <div className="metrica-valor">{inc.resueltos}</div>
            <div className="metrica-label">Incidentes resueltos</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${inc.abiertosCierre > 0 ? "alerta" : ""}`}>{inc.abiertosCierre}</div>
            <div className="metrica-label">{enCurso ? "Abiertos hoy" : "Abiertos al cierre"}</div>
          </div>
          <div className="metrica">
            <div className={`metrica-valor ${inc.msCaidaTotal > 0 ? "alerta" : ""}`}>
              {inc.msCaidaTotal > 0 ? duracion(inc.msCaidaTotal) : "0"}
            </div>
            <div className="metrica-label">Tiempo en caída total</div>
          </div>
        </div>
        {inc.porServicio.length === 0 ? (
          <div className="vacio">
            <strong>Sin afectaciones en {etiquetaMes(clave)}</strong>
            Ningún servicio registró incidentes que tocaran este mes.
          </div>
        ) : (
          <div className="tarjeta" style={{ padding: 0 }}>
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
                        {s.disponibilidad >= 99.995 ? "100" : s.disponibilidad.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          </div>
        </div>
      </section>
    </>
  );
}
