import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folio } from "@/lib/format";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";

export const dynamic = "force-dynamic";

export default async function Resumen() {
  const sb = getSupabase();
  if (!sb) {
    return (
      <>
        <div className="pagina-head">
          <div>
            <h1 className="pagina-titulo">Resumen</h1>
            <p className="pagina-desc">Estado general del departamento</p>
          </div>
        </div>
        <SinConexion />
      </>
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const en14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [equipos, ticketsAbiertos, mantosProximos, ultimosTickets] = await Promise.all([
    sb.from("equipos").select("estado"),
    sb.from("tickets").select("id", { count: "exact", head: true }).in("estado", ["abierto", "en_proceso"]),
    sb.from("mantenimientos").select("*").in("estado", ["programado", "en_proceso"])
      .gte("fecha_programada", hoy).lte("fecha_programada", en14)
      .order("fecha_programada", { ascending: true }).limit(5),
    sb.from("tickets").select("*").order("created_at", { ascending: false }).limit(5),
  ]);

  const totalEquipos = equipos.data?.length ?? 0;
  const enReparacion = equipos.data?.filter((e) => e.estado === "en_reparacion").length ?? 0;
  const abiertos = ticketsAbiertos.count ?? 0;
  const proximos = mantosProximos.data ?? [];

  return (
    <>
      <div className="pagina-head">
        <div>
          <h1 className="pagina-titulo">Resumen</h1>
          <p className="pagina-desc">Estado general del departamento</p>
        </div>
      </div>

      <div className="metricas">
        <div className="metrica">
          <div className="metrica-valor">{totalEquipos}</div>
          <div className="metrica-label">Equipos en inventario</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${enReparacion > 0 ? "alerta" : ""}`}>{enReparacion}</div>
          <div className="metrica-label">En reparación</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${abiertos > 0 ? "alerta" : ""}`}>{abiertos}</div>
          <div className="metrica-label">Tickets sin resolver</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{proximos.length}</div>
          <div className="metrica-label">Mantenimientos en 14 días</div>
        </div>
      </div>

      <section className="seccion">
        <h2 className="seccion-titulo">Próximos mantenimientos</h2>
        {proximos.length === 0 ? (
          <div className="vacio">Nada programado para las próximas dos semanas. <Link href="/mantenimientos" style={{ textDecoration: "underline" }}>Programar uno</Link></div>
        ) : (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Trabajo</th><th>Tipo</th><th>Responsable</th><th>Estado</th></tr></thead>
            <tbody>
              {proximos.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{fechaCorta(m.fecha_programada)}</td>
                  <td className="celda-principal">{m.titulo}</td>
                  <td className="suave">{m.tipo}</td>
                  <td className="suave">{m.responsable ?? "—"}</td>
                  <td><Insignia valor={m.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Últimos tickets</h2>
        {(ultimosTickets.data ?? []).length === 0 ? (
          <div className="vacio">Sin tickets registrados todavía.</div>
        ) : (
          <table className="tabla">
            <thead><tr><th>Folio</th><th>Asunto</th><th>Solicitante</th><th>Prioridad</th><th>Estado</th></tr></thead>
            <tbody>
              {(ultimosTickets.data ?? []).map((t) => (
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
