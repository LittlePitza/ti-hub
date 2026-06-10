import { getSupabase } from "@/lib/supabase";
import { fechaCorta } from "@/lib/format";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import { crearMantenimiento, cambiarEstadoMantenimiento, eliminarMantenimiento } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS = ["programado", "en_proceso", "completado", "cancelado"];

export default async function Mantenimientos() {
  const sb = getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Mantenimientos</h1>
        <p className="pagina-desc">Trabajos preventivos y correctivos programados</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const [{ data: mantos }, { data: equipos }] = await Promise.all([
    sb.from("mantenimientos").select("*, equipos(nombre)").order("fecha_programada", { ascending: true }),
    sb.from("equipos").select("id, nombre").neq("estado", "baja").order("nombre"),
  ]);

  const hoy = new Date().toISOString().slice(0, 10);
  const lista = mantos ?? [];
  const pendientes = lista.filter((m) => ["programado", "en_proceso"].includes(m.estado));
  const historial = lista.filter((m) => ["completado", "cancelado"].includes(m.estado)).reverse();

  const fila = (m: any) => {
    const vencido = m.fecha_programada < hoy && ["programado", "en_proceso"].includes(m.estado);
    return (
      <tr key={m.id}>
        <td className="mono" style={vencido ? { color: "var(--critico)", fontWeight: 600 } : undefined}>
          {fechaCorta(m.fecha_programada)}{vencido ? " ·!" : ""}
        </td>
        <td>
          <div className="celda-principal">{m.titulo}</div>
          {m.notas && <div className="suave" style={{ fontSize: 12.5 }}>{m.notas}</div>}
        </td>
        <td className="suave">{m.tipo}</td>
        <td className="suave">{m.equipos?.nombre ?? "—"}</td>
        <td className="suave">{m.responsable ?? "—"}</td>
        <td><Insignia valor={m.estado} /></td>
        <td style={{ whiteSpace: "nowrap" }}>
          <form action={cambiarEstadoMantenimiento} style={{ display: "inline-flex", gap: 6 }}>
            <input type="hidden" name="id" value={m.id} />
            <select name="estado" defaultValue={m.estado} style={{ border: "1px solid var(--linea-fuerte)", borderRadius: 5, padding: "3px 6px", fontSize: 12.5 }}>
              {ESTADOS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <button className="boton secundario mini" type="submit">Actualizar</button>
          </form>{" "}
          <form action={eliminarMantenimiento} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={m.id} />
            <button className="boton secundario mini" type="submit" style={{ color: "var(--critico)" }}>Eliminar</button>
          </form>
        </td>
      </tr>
    );
  };

  return (
    <>
      {head}

      <form className="formulario" action={crearMantenimiento}>
        <h2>Programar mantenimiento</h2>
        <div className="campos">
          <div className="campo ancho">
            <label htmlFor="mt-titulo">Trabajo a realizar</label>
            <input id="mt-titulo" name="titulo" required placeholder="Limpieza física y cambio de pasta térmica" />
          </div>
          <div className="campo">
            <label htmlFor="mt-fecha">Fecha programada</label>
            <input id="mt-fecha" name="fecha_programada" type="date" required />
          </div>
          <div className="campo">
            <label htmlFor="mt-tipo">Tipo</label>
            <select id="mt-tipo" name="tipo" defaultValue="preventivo">
              <option value="preventivo">preventivo</option>
              <option value="correctivo">correctivo</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="mt-equipo">Equipo (opcional)</label>
            <select id="mt-equipo" name="equipo_id" defaultValue="">
              <option value="">— Sin equipo específico —</option>
              {(equipos ?? []).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="mt-resp">Responsable</label>
            <input id="mt-resp" name="responsable" placeholder="Lalo" />
          </div>
          <div className="campo ancho">
            <label htmlFor="mt-notas">Notas</label>
            <textarea id="mt-notas" name="notas" placeholder="Material necesario, ventana de tiempo, pendientes…" />
          </div>
        </div>
        <button className="boton" type="submit">Programar</button>
      </form>

      <section className="seccion">
        <h2 className="seccion-titulo">Pendientes</h2>
        {pendientes.length === 0 ? (
          <div className="vacio">Sin mantenimientos pendientes.</div>
        ) : (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Trabajo</th><th>Tipo</th><th>Equipo</th><th>Responsable</th><th>Estado</th><th></th></tr></thead>
            <tbody>{pendientes.map(fila)}</tbody>
          </table>
        )}
      </section>

      {historial.length > 0 && (
        <section className="seccion">
          <h2 className="seccion-titulo">Historial</h2>
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Trabajo</th><th>Tipo</th><th>Equipo</th><th>Responsable</th><th>Estado</th><th></th></tr></thead>
            <tbody>{historial.map(fila)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
