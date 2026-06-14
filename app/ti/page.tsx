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

      {/* Pulso del departamento: las cifras que deciden el día */}
      <div className="metricas">
        <div className="metrica">
          <div className={`metrica-valor ${ticketsActivos.length > 0 ? "alerta" : ""}`}>{ticketsActivos.length}</div>
          <div className="metrica-label">Tickets sin resolver</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${fueraDeSla > 0 ? "alerta" : ""}`}>{fueraDeSla}</div>
          <div className="metrica-label">Fuera de SLA</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${porVencer > 0 ? "alerta" : ""}`}>{porVencer}</div>
          <div className="metrica-label">Por vencer SLA</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${enReparacion > 0 ? "alerta" : ""}`}>{enReparacion}</div>
          <div className="metrica-label">Equipos en reparación</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${vencidos.length > 0 ? "alerta" : ""}`}>{vencidos.length}</div>
          <div className="metrica-label">Mantenimientos vencidos</div>
        </div>
      </div>

      <div className="dash-cols">
        {/* Columna principal: SLA + gráficas */}
        <div className="dash-main">
          <section>
            <h2 className="banda-titulo">Atención de tickets · SLA</h2>
            <div className="metricas compacta">
              <div className="metrica">
                <div className="metrica-valor">{tiemposRespuesta.length ? duracion(promedio(tiemposRespuesta)) : "—"}</div>
                <div className="metrica-label">1ª respuesta promedio</div>
              </div>
              <div className="metrica">
                <div className="metrica-valor">{tiemposResolucion.length ? duracion(promedio(tiemposResolucion)) : "—"}</div>
                <div className="metrica-label">Resolución promedio</div>
              </div>
              <div className="metrica">
                <div className={`metrica-valor ${pctRespuestaSla !== null && pctRespuestaSla < 80 ? "alerta" : ""}`}>
                  {pctRespuestaSla === null ? "—" : `${pctRespuestaSla}%`}
                </div>
                <div className="metrica-label">Respuesta dentro de SLA</div>
              </div>
              <div className="metrica">
                <div className="metrica-valor">{equipos.length}</div>
                <div className="metrica-label">Equipos en inventario</div>
              </div>
            </div>
          </section>

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
