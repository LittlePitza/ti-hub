import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folio } from "@/lib/format";
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
  const ticketsActivos = tickets.filter((t) => ["abierto", "en_proceso"].includes(t.estado));
  const vencidos = mantos.filter((m) => m.fecha_programada < hoy);
  const proximos = mantos.filter((m) => m.fecha_programada >= hoy);

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
          <div className={`metrica-valor ${ticketsActivos.length > 0 ? "alerta" : ""}`}>{ticketsActivos.length}</div>
          <div className="metrica-label">Tickets sin resolver</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${vencidos.length > 0 ? "alerta" : ""}`}>{vencidos.length}</div>
          <div className="metrica-label">Mantenimientos vencidos</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{proximos.length}</div>
          <div className="metrica-label">Mantenimientos en 14 días</div>
        </div>
      </div>

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

      <section className="seccion">
        <h2 className="seccion-titulo">Próximos mantenimientos</h2>
        {mantos.length === 0 ? (
          <div className="vacio">Nada programado para las próximas dos semanas. <Link href="/mantenimientos" style={{ textDecoration: "underline" }}>Programar uno</Link></div>
        ) : (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Trabajo</th><th>Tipo</th><th>Responsable</th><th>Estado</th></tr></thead>
            <tbody>
              {mantos.map((m) => {
                const vencido = m.fecha_programada < hoy;
                return (
                  <tr key={m.id}>
                    <td className={`mono ${vencido ? "fecha-vencida" : ""}`}>
                      {fechaCorta(m.fecha_programada)}{vencido && " · vencido"}
                    </td>
                    <td className="celda-principal">{m.titulo}</td>
                    <td className="suave">{m.tipo}</td>
                    <td className="suave">{m.responsable ?? "—"}</td>
                    <td><Insignia valor={m.estado} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {garantias.length > 0 && (
        <section className="seccion">
          <h2 className="seccion-titulo">Garantías por vencer · próximos 90 días</h2>
          <table className="tabla">
            <thead><tr><th>Equipo</th><th>Tipo</th><th>Vence</th><th>Días restantes</th></tr></thead>
            <tbody>
              {garantias.map((e) => {
                const dias = Math.ceil((new Date(e.garantia_hasta! + "T12:00:00").getTime() - Date.now()) / 86400000);
                return (
                  <tr key={e.nombre}>
                    <td className="celda-principal">{e.nombre}</td>
                    <td className="suave">{TIPOS_EQUIPO[e.tipo] ?? e.tipo}</td>
                    <td className="mono">{fechaCorta(e.garantia_hasta)}</td>
                    <td className={`mono ${dias <= 30 ? "fecha-vencida" : "suave"}`}>{dias} días</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="seccion">
        <h2 className="seccion-titulo">Últimos tickets</h2>
        {ultimosTickets.length === 0 ? (
          <div className="vacio">Sin tickets registrados todavía.</div>
        ) : (
          <table className="tabla">
            <thead><tr><th>Folio</th><th>Asunto</th><th>Solicitante</th><th>Prioridad</th><th>Estado</th></tr></thead>
            <tbody>
              {ultimosTickets.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{folio(t.num)}</td>
                  <td className="celda-principal">{t.titulo}</td>
                  <td className="suave">{t.solicitante}</td>
                  <td><Insignia valor={t.prioridad} esPrioridad /></td>
                  <td><Insignia valor={t.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
