import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folio, duracion } from "@/lib/format";
import {
  ESTADOS_TICKET,
  ESTADOS_SELECCIONABLES,
  ESTADOS_ACTIVOS,
  ESTADOS_CERRADOS,
  ESTADOS_ARCHIVADOS,
  PRIORIDADES,
  ORDEN_PRIORIDAD,
  evaluarRespuesta,
} from "@/lib/tickets";
import { getConfigCorreo, resolverSla } from "@/lib/correo";
import Insignia from "@/components/Insignia";
import PildoraSla from "@/components/PildoraSla";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import TableroTickets from "@/components/TableroTickets";
import ModalCrearTicket from "@/components/ModalCrearTicket";
import { cambiarEstadoTicket } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets" };

export default async function Tickets({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; prioridad?: string; vista?: string }>;
}) {
  const { q = "", estado = "", prioridad = "", vista = "tablero" } = await searchParams;
  const esLista = vista === "lista";
  const sb = await getSupabase();
  const head = (accion?: React.ReactNode) => (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Tickets</h1>
        <p className="pagina-desc">
          Bandeja de soporte · prioriza, mueve y vigila los tiempos de respuesta
        </p>
      </div>
      {accion}
    </div>
  );
  if (!sb)
    return (
      <>
        {head()}
        <SinConexion />
      </>
    );

  const [{ data }, configCorreo, { data: empleados }] = await Promise.all([
    // Solo lo que pintan lista y tablero: los `adjuntos` (jsonb) viven en el detalle.
    sb
      .from("tickets")
      .select(
        "id, num, titulo, descripcion, solicitante, categoria, prioridad, estado, asignado_a, created_at, primera_respuesta_at, resuelto_at, equipos(nombre)",
      )
      .order("created_at", { ascending: false }),
    getConfigCorreo(sb),
    sb
      .from("empleados")
      .select("nombre, correo, departamento")
      .eq("estado", "activo")
      .order("nombre"),
  ]);
  // El join `equipos(nombre)` se infiere como arreglo; en la práctica es un objeto.
  const lista: any[] = data ?? [];
  const { sla, porVencerPct } = resolverSla(configCorreo);

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
      if (estado === "cerrados") return ESTADOS_CERRADOS.includes(t.estado);
      if (estado === "archivados") return ESTADOS_ARCHIVADOS.includes(t.estado);
      return t.estado === estado;
    }
    return true;
  };

  const porPrioridad = (a: any, b: any) =>
    (ORDEN_PRIORIDAD[a.prioridad] ?? 9) - (ORDEN_PRIORIDAD[b.prioridad] ?? 9);

  const filtrados = lista.filter(coincide);
  const ahora = Date.now();
  const activos = filtrados.filter((t) => ESTADOS_ACTIVOS.includes(t.estado)).sort(porPrioridad);
  const cerrados = filtrados.filter((t) => ESTADOS_CERRADOS.includes(t.estado));
  const archivados = filtrados.filter((t) => ESTADOS_ARCHIVADOS.includes(t.estado));

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
      <th>Folio</th>
      <th>Asunto</th>
      <th>Solicitante</th>
      <th>Prioridad</th>
      <th>Respuesta</th>
      <th>Creado</th>
      <th>Estado</th>
      <th></th>
    </tr>
  );
  const fila = (t: any) => {
    const r = evaluarRespuesta(t, ahora, sla, porVencerPct);
    return (
      <tr key={t.id}>
        <td className="mono">
          <Link href={`/ti/tickets/${t.id}`} className="enlace-folio">
            {folio(t.num)}
          </Link>
        </td>
        <td>
          <div className="celda-principal">
            <Link href={`/ti/tickets/${t.id}`} className="enlace-suave">
              {t.titulo}
            </Link>
          </div>
          {t.descripcion && (
            <div className="suave recorte" style={{ fontSize: 12.5 }}>
              {t.descripcion}
            </div>
          )}
          {t.equipos?.nombre && (
            <div className="suave mono" style={{ fontSize: 12 }}>
              equipo: {t.equipos.nombre}
            </div>
          )}
        </td>
        <td className="suave">{t.solicitante}</td>
        <td>
          <Insignia valor={t.prioridad} esPrioridad />
        </td>
        <td>
          <PildoraSla semaforo={r.semaforo} />
          <div className="suave mono" style={{ fontSize: 11.5, marginTop: 2 }}>
            {r.pendiente ? `${duracion(r.ms)} sin atender` : duracion(r.ms)}
          </div>
        </td>
        <td className="mono">{fechaCorta(t.created_at)}</td>
        <td>
          <Insignia valor={t.estado} />
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          <div className="fila-acciones">
            <form action={cambiarEstadoTicket}>
              <input type="hidden" name="id" value={t.id} />
              <select name="estado" defaultValue={t.estado}>
                {ESTADOS_SELECCIONABLES.map((valor) => {
                  const meta = ESTADOS_TICKET.find((s) => s.valor === valor);
                  return (
                    <option key={valor} value={valor}>
                      {meta?.etiqueta ?? valor}
                    </option>
                  );
                })}
              </select>
              <BotonEnviar className="boton secundario mini" ocupado="…">
                Actualizar
              </BotonEnviar>
            </form>
            <Link href={`/ti/tickets/${t.id}`} className="boton secundario mini">
              Abrir
            </Link>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      {head(<ModalCrearTicket empleados={empleados ?? []} />)}

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
            <option value="cerrados">Cerrados</option>
            <option value="archivados">Archivados</option>
            {ESTADOS_SELECCIONABLES.map((valor) => {
              const meta = ESTADOS_TICKET.find((s) => s.valor === valor);
              return (
                <option key={valor} value={valor}>
                  {meta?.etiqueta ?? valor}
                </option>
              );
            })}
          </select>
          <select name="prioridad" defaultValue={prioridad} aria-label="Filtrar por prioridad">
            <option value="">Toda prioridad</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button className="boton secundario" type="submit">
            Filtrar
          </button>
          {hayFiltro && (
            <Link href={hrefVista(vista)} className="boton-texto">
              Limpiar
            </Link>
          )}
        </form>

        <div className="vista-toggle" role="tablist" aria-label="Vista de tickets">
          <Link
            href={hrefVista("tablero")}
            className={!esLista ? "activo" : ""}
            aria-selected={!esLista}
          >
            <IconoTablero /> Tablero
          </Link>
          <Link
            href={hrefVista("lista")}
            className={esLista ? "activo" : ""}
            aria-selected={esLista}
          >
            <IconoLista /> Lista
          </Link>
        </div>
      </div>

      {esLista ? (
        // ---------- Vista de lista ----------
        hayFiltro ? (
          <section className="seccion">
            <h2 className="banda-titulo">
              Resultados <span className="conteo">{filtrados.length}</span>
            </h2>
            {filtrados.length === 0 ? (
              <div className="vacio">
                <strong>Sin coincidencias</strong>Ajusta los filtros o limpia la búsqueda.
              </div>
            ) : (
              <table className="tabla">
                <thead>{encabezado}</thead>
                <tbody>{[...activos, ...cerrados, ...archivados].map(fila)}</tbody>
              </table>
            )}
          </section>
        ) : (
          <>
            <section className="seccion">
              <h2 className="banda-titulo">
                Activos · por prioridad <span className="conteo">{activos.length}</span>
              </h2>
              {activos.length === 0 ? (
                <div className="vacio">
                  <strong>Bandeja limpia</strong>No hay tickets activos.
                </div>
              ) : (
                <table className="tabla">
                  <thead>{encabezado}</thead>
                  <tbody>{activos.map(fila)}</tbody>
                </table>
              )}
            </section>
            {cerrados.length > 0 && (
              <section className="seccion">
                <h2 className="banda-titulo">
                  Cerrados <span className="conteo">{cerrados.length}</span>
                </h2>
                <table className="tabla">
                  <thead>{encabezado}</thead>
                  <tbody>{cerrados.map(fila)}</tbody>
                </table>
              </section>
            )}
            {archivados.length > 0 && (
              <section className="seccion">
                <h2 className="banda-titulo">
                  Archivados <span className="conteo">{archivados.length}</span>
                </h2>
                <table className="tabla">
                  <thead>{encabezado}</thead>
                  <tbody>{archivados.map(fila)}</tbody>
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
          sla={sla}
          porVencerPct={porVencerPct}
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="5" height="16" rx="1.2" />
      <rect x="10" y="4" width="5" height="11" rx="1.2" />
      <rect x="17" y="4" width="4" height="14" rx="1.2" />
    </svg>
  );
}
function IconoLista() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}
