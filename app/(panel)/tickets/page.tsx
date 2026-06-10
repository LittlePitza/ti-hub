import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folio } from "@/lib/format";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import { crearTicket, cambiarEstadoTicket, eliminarTicket } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS = ["abierto", "en_proceso", "resuelto", "cerrado"];
const CATEGORIAS = ["hardware", "software", "red", "accesos", "correo", "otro"];
const PRIORIDADES = ["baja", "media", "alta", "critica"];
const ORDEN_PRIORIDAD: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

export default async function Tickets() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Tickets</h1>
        <p className="pagina-desc">Solicitudes y reportes de los usuarios</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data } = await sb.from("tickets").select("*").order("created_at", { ascending: false });
  const lista = data ?? [];
  const activos = lista
    .filter((t) => ["abierto", "en_proceso"].includes(t.estado))
    .sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);
  const cerrados = lista.filter((t) => ["resuelto", "cerrado"].includes(t.estado));

  const fila = (t: any) => (
    <tr key={t.id}>
      <td className="mono">{folio(t.num)}</td>
      <td>
        <div className="celda-principal">{t.titulo}</div>
        {t.descripcion && <div className="suave" style={{ fontSize: 12.5 }}>{t.descripcion}</div>}
      </td>
      <td className="suave">{t.solicitante}</td>
      <td className="suave">{t.categoria}</td>
      <td><Insignia valor={t.prioridad} esPrioridad /></td>
      <td className="mono">{fechaCorta(t.created_at)}</td>
      <td><Insignia valor={t.estado} /></td>
      <td style={{ whiteSpace: "nowrap" }}>
        <form action={cambiarEstadoTicket} style={{ display: "inline-flex", gap: 6 }}>
          <input type="hidden" name="id" value={t.id} />
          <select name="estado" defaultValue={t.estado} style={{ border: "1px solid var(--linea-fuerte)", borderRadius: 5, padding: "3px 6px", fontSize: 12.5 }}>
            {ESTADOS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <button className="boton secundario mini" type="submit">Actualizar</button>
        </form>{" "}
        <form action={eliminarTicket} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={t.id} />
          <button className="boton secundario mini" type="submit" style={{ color: "var(--critico)" }}>Eliminar</button>
        </form>
      </td>
    </tr>
  );

  return (
    <>
      {head}

      <form className="formulario" action={crearTicket}>
        <h2>Levantar ticket</h2>
        <div className="campos">
          <div className="campo ancho">
            <label htmlFor="tk-titulo">Asunto</label>
            <input id="tk-titulo" name="titulo" required placeholder="No imprime desde piso 2" />
          </div>
          <div className="campo">
            <label htmlFor="tk-solicitante">Solicitante</label>
            <input id="tk-solicitante" name="solicitante" required placeholder="Nombre (área)" />
          </div>
          <div className="campo">
            <label htmlFor="tk-categoria">Categoría</label>
            <select id="tk-categoria" name="categoria" defaultValue="hardware">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tk-prioridad">Prioridad</label>
            <select id="tk-prioridad" name="prioridad" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tk-asignado">Asignado a</label>
            <input id="tk-asignado" name="asignado_a" placeholder="Lalo" />
          </div>
          <div className="campo ancho">
            <label htmlFor="tk-desc">Descripción</label>
            <textarea id="tk-desc" name="descripcion" placeholder="Qué pasa, desde cuándo, qué se ha intentado…" />
          </div>
        </div>
        <button className="boton" type="submit">Crear ticket</button>
      </form>

      <section className="seccion">
        <h2 className="seccion-titulo">Activos · por prioridad</h2>
        {activos.length === 0 ? (
          <div className="vacio"><strong>Bandeja limpia</strong>No hay tickets abiertos ni en proceso.</div>
        ) : (
          <table className="tabla">
            <thead><tr><th>Folio</th><th>Asunto</th><th>Solicitante</th><th>Categoría</th><th>Prioridad</th><th>Creado</th><th>Estado</th><th></th></tr></thead>
            <tbody>{activos.map(fila)}</tbody>
          </table>
        )}
      </section>

      {cerrados.length > 0 && (
        <section className="seccion">
          <h2 className="seccion-titulo">Resueltos y cerrados</h2>
          <table className="tabla">
            <thead><tr><th>Folio</th><th>Asunto</th><th>Solicitante</th><th>Categoría</th><th>Prioridad</th><th>Creado</th><th>Estado</th><th></th></tr></thead>
            <tbody>{cerrados.map(fila)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
