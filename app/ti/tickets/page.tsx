import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folio, duracion } from "@/lib/format";
import {
  ESTADOS_TICKET,
  ESTADOS_ACTIVOS,
  ESTADOS_RESUELTOS,
  PRIORIDADES,
  CATEGORIAS_TK,
  ORDEN_PRIORIDAD,
  evaluarRespuesta,
} from "@/lib/tickets";
import Insignia from "@/components/Insignia";
import PildoraSla from "@/components/PildoraSla";
import SinConexion from "@/components/SinConexion";
import TableroTickets from "@/components/TableroTickets";
import { crearTicket, cambiarEstadoTicket } from "./actions";

export const dynamic = "force-dynamic";

export default async function Tickets({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; prioridad?: string; vista?: string }>;
}) {
  const { q = "", estado = "", prioridad = "", vista = "tablero" } = await searchParams;
  const esLista = vista === "lista";
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Tickets</h1>
        <p className="pagina-desc">Bandeja de soporte · prioriza, mueve y vigila los tiempos de respuesta</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data } = await sb
    .from("tickets")
    .select("*, equipos(nombre)")
    .order("created_at", { ascending: false });
  const lista = data ?? [];

  const hayFiltro = Boolean(q || estado || prioridad);
  const texto = q.trim().toLowerCase();
  const coincide = (t: any) => {
    if (texto) {
      const blob = [t.titulo, t.descripcion, t.solicitante, t.asignado_a, folio(t.num)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!blob.includes(texto)) return false;
    }
    if (prioridad && t.prioridad !== prioridad) return false;
    if (estado) {
      if (estado === "activos") return ESTADOS_ACTIVOS.includes(t.estado);
      if (estado === "cerrados") return ESTADOS_RESUELTOS.includes(t.estado);
      return t.estado === estado;
    }
    return true;
  };

  const porPrioridad = (a: any, b: any) =>
    (ORDEN_PRIORIDAD[a.prioridad] ?? 9) - (ORDEN_PRIORIDAD[b.prioridad] ?? 9);

  const filtrados = lista.filter(coincide);
  const ahora = Date.now();
  const activos = filtrados.filter((t) => ESTADOS_ACTIVOS.includes(t.estado)).sort(porPrioridad);
  const cerrados = filtrados.filter((t) => ESTADOS_RESUELTOS.includes(t.estado));

  // Conserva los filtros activos al alternar de vista.
  const hrefVista = (v: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (estado) p.set("estado", estado);
    if (prioridad) p.set("prioridad", prioridad);
    p.set("vista", v);
    return `/ti/tickets?${p.toString()}`;
  };

  // --- Fila de la vista de lista ---
  const encabezado = (
    <tr>
      <th>Folio</th><th>Asunto</th><th>Solicitante</th><th>Prioridad</th>
      <th>Respuesta</th><th>Creado</th><th>Estado</th><th></th>
    </tr>
  );
  const fila = (t: any) => {
    const r = evaluarRespuesta(t, ahora);
    return (
      <tr key={t.id}>
        <td className="mono">
          <Link href={`/ti/tickets/${t.id}`} className="enlace-folio">{folio(t.num)}</Link>
        </td>
        <td>
          <div className="celda-principal">
            <Link href={`/ti/tickets/${t.id}`} className="enlace-suave">{t.titulo}</Link>
          </div>
          {t.descripcion && <div className="suave recorte" style={{ fontSize: 12.5 }}>{t.descripcion}</div>}
          {t.equipos?.nombre && <div className="suave mono" style={{ fontSize: 12 }}>equipo: {t.equipos.nombre}</div>}
        </td>
        <td className="suave">{t.solicitante}</td>
        <td><Insignia valor={t.prioridad} esPrioridad /></td>
        <td>
          <PildoraSla semaforo={r.semaforo} />
          <div className="suave mono" style={{ fontSize: 11.5, marginTop: 2 }}>
            {r.pendiente ? `${duracion(r.ms)} sin atender` : duracion(r.ms)}
          </div>
        </td>
        <td className="mono">{fechaCorta(t.created_at)}</td>
        <td><Insignia valor={t.estado} /></td>
        <td style={{ whiteSpace: "nowrap" }}>
          <div className="fila-acciones">
            <form action={cambiarEstadoTicket}>
              <input type="hidden" name="id" value={t.id} />
              <select name="estado" defaultValue={t.estado}>
                {ESTADOS_TICKET.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
              </select>
              <button className="boton secundario mini" type="submit">Actualizar</button>
            </form>
            <Link href={`/ti/tickets/${t.id}`} className="boton secundario mini">Abrir</Link>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      {head}

      <details className="plegable">
        <summary>Levantar ticket</summary>
        <form className="formulario plano" action={crearTicket}>
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
                {CATEGORIAS_TK.map((c) => <option key={c} value={c}>{c}</option>)}
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
      </details>

      <div className="toolbar">
        <form className="filtros" method="get">
          <input type="hidden" name="vista" value={vista} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por folio, asunto, solicitante…"
            aria-label="Buscar tickets"
          />
          <select name="estado" defaultValue={estado} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="activos">Solo activos</option>
            <option value="cerrados">Resueltos y cerrados</option>
            {ESTADOS_TICKET.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
          </select>
          <select name="prioridad" defaultValue={prioridad} aria-label="Filtrar por prioridad">
            <option value="">Toda prioridad</option>
            {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="boton secundario" type="submit">Filtrar</button>
          {hayFiltro && <Link href={hrefVista(vista)} className="boton-texto">Limpiar</Link>}
        </form>

        <div className="vista-toggle" role="tablist" aria-label="Vista de tickets">
          <Link href={hrefVista("tablero")} className={!esLista ? "activo" : ""} aria-selected={!esLista}>
            <IconoTablero /> Tablero
          </Link>
          <Link href={hrefVista("lista")} className={esLista ? "activo" : ""} aria-selected={esLista}>
            <IconoLista /> Lista
          </Link>
        </div>
      </div>

      {esLista ? (
        // ---------- Vista de lista ----------
        hayFiltro ? (
          <section className="seccion">
            <h2 className="banda-titulo">Resultados <span className="conteo">{filtrados.length}</span></h2>
            {filtrados.length === 0 ? (
              <div className="vacio"><strong>Sin coincidencias</strong>Ajusta los filtros o limpia la búsqueda.</div>
            ) : (
              <table className="tabla">
                <thead>{encabezado}</thead>
                <tbody>{[...activos, ...cerrados].map(fila)}</tbody>
              </table>
            )}
          </section>
        ) : (
          <>
            <section className="seccion">
              <h2 className="banda-titulo">Activos · por prioridad <span className="conteo">{activos.length}</span></h2>
              {activos.length === 0 ? (
                <div className="vacio"><strong>Bandeja limpia</strong>No hay tickets activos.</div>
              ) : (
                <table className="tabla">
                  <thead>{encabezado}</thead>
                  <tbody>{activos.map(fila)}</tbody>
                </table>
              )}
            </section>
            {cerrados.length > 0 && (
              <section className="seccion">
                <h2 className="banda-titulo">Resueltos y cerrados <span className="conteo">{cerrados.length}</span></h2>
                <table className="tabla">
                  <thead>{encabezado}</thead>
                  <tbody>{cerrados.map(fila)}</tbody>
                </table>
              </section>
            )}
          </>
        )
      ) : (
        // ---------- Vista de tablero (kanban por estado, arrastrar y soltar) ----------
        <TableroTickets
          tickets={filtrados}
          ahora={ahora}
          hrefLista={hrefVista("lista")}
          hayFiltro={hayFiltro}
          hrefLimpiar={hrefVista("tablero")}
        />
      )}
    </>
  );
}

function IconoTablero() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="5" height="16" rx="1.2" />
      <rect x="10" y="4" width="5" height="11" rx="1.2" />
      <rect x="17" y="4" width="4" height="14" rx="1.2" />
    </svg>
  );
}
function IconoLista() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}
