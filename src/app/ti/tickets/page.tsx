import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { shortDate, ticketFolio, duration } from "@/lib/utils/format";
import {
  TICKET_STATUSES,
  SELECTABLE_STATUSES,
  PRIORITIES,
  PRIORITY_ORDER,
  evaluateResponse,
  isActiveStatus,
  isClosedStatus,
  isArchivedStatus,
} from "@/lib/domain/tickets";
import { getEmailConfig, resolveSla } from "@/lib/domain/email";
import Badge from "@/components/ui/Badge";
import SlaPill from "@/components/ui/SlaPill";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import TicketBoard from "@/components/tickets/TicketBoard";
import NewTicketModal from "@/components/tickets/NewTicketModal";
import { changeTicketStatus } from "./actions";

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
        <NoConnection />
      </>
    );

  const [{ data }, configCorreo, { data: empleados }] = await Promise.all([
    // Only what the list and the board render: the `adjuntos` (jsonb) live on the
    // detail page.
    sb
      .from("tickets")
      .select(
        "id, num, titulo, descripcion, solicitante, categoria, prioridad, estado, asignado_a, created_at, primera_respuesta_at, resuelto_at, equipos(nombre)",
      )
      .order("created_at", { ascending: false }),
    getEmailConfig(sb),
    sb
      .from("empleados")
      .select("nombre, correo, departamento")
      .eq("estado", "activo")
      .order("nombre"),
  ]);
  // The `equipos(nombre)` join is inferred as an array; in practice it is an object.
  const lista: any[] = data ?? [];
  const { sla, porVencerPct } = resolveSla(configCorreo);

  const hayFiltro = Boolean(q || estado || prioridad);
  const text = q.trim().toLowerCase();
  const coincide = (t: any) => {
    if (text) {
      const blob = [t.titulo, t.descripcion, t.solicitante, t.asignado_a, ticketFolio(t.num)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!blob.includes(text)) return false;
    }
    if (prioridad && t.prioridad !== prioridad) return false;
    if (estado) {
      if (estado === "activos") return isActiveStatus(t.estado);
      if (estado === "cerrados") return isClosedStatus(t.estado);
      if (estado === "archivados") return isArchivedStatus(t.estado);
      return t.estado === estado;
    }
    return true;
  };

  const porPrioridad = (a: any, b: any) =>
    (PRIORITY_ORDER[a.prioridad] ?? 9) - (PRIORITY_ORDER[b.prioridad] ?? 9);

  const filtrados = lista.filter(coincide);
  const ahora = Date.now();
  const activos = filtrados.filter((t) => isActiveStatus(t.estado)).sort(porPrioridad);
  const cerrados = filtrados.filter((t) => isClosedStatus(t.estado));
  const archivados = filtrados.filter((t) => isArchivedStatus(t.estado));

  // Keeps the active filters when switching views.
  const hrefVista = (v: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (estado) p.set("estado", estado);
    if (prioridad) p.set("prioridad", prioridad);
    p.set("vista", v);
    return `/ti/tickets?${p.toString()}`;
  };

  // --- List-view row ---
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
    const r = evaluateResponse(t, ahora, sla, porVencerPct);
    return (
      <tr key={t.id}>
        <td className="mono">
          <Link href={`/ti/tickets/${t.id}`} className="enlace-folio">
            {ticketFolio(t.num)}
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
          <Badge value={t.prioridad} isPriority />
        </td>
        <td>
          <SlaPill slaStatus={r.slaStatus} />
          <div className="suave mono" style={{ fontSize: 11.5, marginTop: 2 }}>
            {r.pending ? `${duration(r.ms)} sin atender` : duration(r.ms)}
          </div>
        </td>
        <td className="mono">{shortDate(t.created_at)}</td>
        <td>
          <Badge value={t.estado} />
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          <div className="fila-acciones">
            <form action={changeTicketStatus}>
              <input type="hidden" name="id" value={t.id} />
              <select name="estado" defaultValue={t.estado}>
                {SELECTABLE_STATUSES.map((value) => {
                  const meta = TICKET_STATUSES.find((s) => s.value === value);
                  return (
                    <option key={value} value={value}>
                      {meta?.label ?? value}
                    </option>
                  );
                })}
              </select>
              <SubmitButton className="boton secundario mini" ocupado="…">
                Actualizar
              </SubmitButton>
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
      {head(<NewTicketModal empleados={empleados ?? []} />)}

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
            {SELECTABLE_STATUSES.map((value) => {
              const meta = TICKET_STATUSES.find((s) => s.value === value);
              return (
                <option key={value} value={value}>
                  {meta?.label ?? value}
                </option>
              );
            })}
          </select>
          <select name="prioridad" defaultValue={prioridad} aria-label="Filtrar por prioridad">
            <option value="">Toda prioridad</option>
            {PRIORITIES.map((p) => (
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
        // ---------- List view ----------
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
        // ---------- Board view (kanban by status, drag and drop) ----------
        <TicketBoard
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
