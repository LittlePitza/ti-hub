"use client";

import {
  useState,
  useTransition,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { ticketFolio, duration } from "@/lib/utils/format";
import {
  PRIORITY_ORDER,
  evaluateResponse,
  evaluateResolution,
  type SlaTable,
  isActiveStatus,
  isArchivedStatus,
} from "@/lib/domain/tickets";
import Badge from "../ui/Badge";
import SlaPill from "../ui/SlaPill";
import MoveStatus from "./MoveStatus";
import { changeTicketStatus } from "@/app/ti/tickets/actions";

type BoardTicket = {
  id: string;
  num: number;
  titulo: string;
  solicitante: string;
  prioridad: string;
  estado: string;
  categoria: string;
  asignado_a: string | null;
  created_at: string;
  primera_respuesta_at?: string | null;
  resuelto_at?: string | null;
  equipos?: { nombre: string } | null;
};

// Per-card priority rail, plus each column's accent and target status.
const PRIO_VAR: Record<string, string> = {
  critica: "var(--critico)",
  alta: "var(--aviso)",
  media: "var(--petroleo)",
  baja: "var(--linea-fuerte)",
};

const COLUMNAS: {
  titulo: string;
  estados: string[];
  destino: string;
  acento: string;
  limite?: number;
  hecho?: boolean;
}[] = [
  {
    titulo: "Por atender",
    estados: ["abierto", "reabierto"],
    destino: "abierto",
    acento: "var(--critico)",
  },
  { titulo: "En proceso", estados: ["en_proceso"], destino: "en_proceso", acento: "var(--aviso)" },
  { titulo: "En espera", estados: ["en_espera"], destino: "en_espera", acento: "var(--petroleo)" },
  // Closing is the normal end of the work; archiving (cold storage) is done from
  // the card's selector and lives in the accordion below, not in a column.
  {
    titulo: "Cerrados",
    estados: ["cerrado", "resuelto"],
    destino: "cerrado",
    acento: "var(--ok)",
    limite: 8,
    hecho: true,
  },
];

const initials = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

// Resolved: newest on top — finished work reads like a log.
const porResueltoReciente = (a: BoardTicket, b: BoardTicket) =>
  (b.resuelto_at ?? b.created_at).localeCompare(a.resuelto_at ?? a.created_at);

export default function TicketBoard({
  tickets,
  ahora,
  sla,
  porVencerPct,
  hrefLista,
  hayFiltro,
  hrefLimpiar,
}: {
  tickets: BoardTicket[];
  ahora: number;
  sla?: SlaTable;
  porVencerPct?: number;
  hrefLista: string;
  hayFiltro: boolean;
  hrefLimpiar: string;
}) {
  // Optimistic moves: on drop the card changes column instantly; the server
  // action revalidates and the server data confirms the change.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  // A <select>/<input> inside a draggable element goes inert (Firefox will not
  // even open the select). Touching a control disables the card's drag for that
  // gesture, and it is restored when the cursor is released.
  const [noArrastrar, setNoArrastrar] = useState(false);
  const [pending, startTransition] = useTransition();

  const efectivo = tickets.map((t) => ({ ...t, estado: moves[t.id] ?? t.estado }));

  const fueraDeSla = (t: BoardTicket) =>
    evaluateResponse(t, ahora, sla, porVencerPct).slaStatus === "incumplido" ||
    evaluateResolution(t, ahora, sla, porVencerPct).slaStatus === "incumplido";

  const activos = efectivo.filter((t) => isActiveStatus(t.estado));
  const archivados = efectivo.filter((t) => isArchivedStatus(t.estado)).sort(porResueltoReciente);
  const fueraSla = activos.filter(fueraDeSla).length;
  const sinAsignar = activos.filter((t) => !t.asignado_a).length;
  const porPrioridad = (a: BoardTicket, b: BoardTicket) =>
    (PRIORITY_ORDER[a.prioridad] ?? 9) - (PRIORITY_ORDER[b.prioridad] ?? 9);

  function alSoltar(e: DragEvent, destino: string, estadosCol: string[]) {
    e.preventDefault();
    setSobre(null);
    setArrastrando(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const t = efectivo.find((x) => x.id === id);
    if (!t || estadosCol.includes(t.estado)) return; // same column: nothing to do

    setMoves((m) => ({ ...m, [id]: destino }));
    const fd = new FormData();
    fd.set("id", id);
    fd.set("estado", destino);
    fd.set("nota", "Movido en el tablero");
    startTransition(() => {
      changeTicketStatus(fd);
    });
  }

  // Drag props shared by active cards and resolved rows.
  const dragProps = (id: string) => ({
    draggable: !noArrastrar,
    onMouseDown: (e: MouseEvent) =>
      setNoArrastrar(
        Boolean((e.target as HTMLElement).closest("a, button, select, input, textarea, label")),
      ),
    onMouseUp: () => setNoArrastrar(false),
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setArrastrando(id);
    },
    onDragEnd: () => {
      setArrastrando(null);
      setSobre(null);
      setNoArrastrar(false);
    },
  });

  // Full card for active work.
  const tarjeta = (t: BoardTicket) => {
    const r = evaluateResponse(t, ahora, sla, porVencerPct);
    const fuera = fueraDeSla(t);
    return (
      <article
        key={t.id}
        className={`tk-card ${fuera ? "sla-fuera" : ""} ${arrastrando === t.id ? "arrastrando" : ""}`}
        style={{ "--prio": PRIO_VAR[t.prioridad] ?? "var(--linea-fuerte)" } as CSSProperties}
        {...dragProps(t.id)}
      >
        <div className="tk-card-top">
          <Link href={`/ti/tickets/${t.id}`} className="tk-card-titulo" draggable={false}>
            {t.titulo}
          </Link>
          <Badge value={t.prioridad} isPriority />
        </div>
        <div className="tk-card-meta">
          <Link href={`/ti/tickets/${t.id}`} className="enlace-folio" draggable={false}>
            {ticketFolio(t.num)}
          </Link>
          <span>·</span>
          <span>{t.solicitante}</span>
          {t.equipos?.nombre && (
            <>
              <span>·</span>
              <span className="mono">{t.equipos.nombre}</span>
            </>
          )}
        </div>
        <div className="tk-tags">
          <span className="tk-tag">{t.categoria}</span>
          <span title={r.pending ? `${duration(r.ms)} sin atender` : duration(r.ms)}>
            <SlaPill slaStatus={r.slaStatus} />
          </span>
        </div>
        <div className="tk-card-pie">
          {t.asignado_a ? (
            <span className="tk-asignado" title={`Asignado a ${t.asignado_a}`}>
              <span className="tk-avatar" aria-hidden>
                {initials(t.asignado_a)}
              </span>
              <span className="tk-asignado-nombre">{t.asignado_a}</span>
            </span>
          ) : (
            <span className="tk-asignado libre">
              <span className="tk-avatar" aria-hidden>
                ?
              </span>
              <span className="tk-asignado-nombre">Sin asignar</span>
            </span>
          )}
          <MoveStatus id={t.id} estado={t.estado} label={ticketFolio(t.num)} />
        </div>
      </article>
    );
  };

  // Condensed row for finished work: what is done recedes, it does not compete.
  const filaHecha = (t: BoardTicket) => {
    const reso = evaluateResolution(t, ahora, sla, porVencerPct);
    return (
      <article
        key={t.id}
        className={`tk-done ${arrastrando === t.id ? "arrastrando" : ""}`}
        {...dragProps(t.id)}
      >
        <span className="tk-done-check" aria-hidden>
          ✓
        </span>
        <Link href={`/ti/tickets/${t.id}`} className="tk-done-titulo" draggable={false}>
          {t.titulo}
        </Link>
        <span className="tk-done-fin">
          {reso.slaStatus !== "na" && !reso.pending && (
            <span className="tk-done-tiempo" title={`Resuelto en ${duration(reso.ms)}`}>
              {duration(reso.ms)}
            </span>
          )}
        </span>
      </article>
    );
  };

  return (
    <>
      <div className="tablero-resumen">
        <span>
          <b>{activos.length}</b> activos
        </span>
        {fueraSla > 0 && <span className="alerta">{fueraSla} fuera de SLA</span>}
        {sinAsignar > 0 && <span className="aviso-txt">{sinAsignar} sin asignar</span>}
        <span className="suave" style={{ fontSize: 11.5 }}>
          Arrastra una tarjeta para cambiar su estado
        </span>
        {pending && (
          <span className="tablero-guardando" role="status">
            <span className="spinner" aria-hidden />
            Guardando…
          </span>
        )}
        {hayFiltro && (
          <Link href={hrefLimpiar} className="boton-texto">
            Limpiar filtros
          </Link>
        )}
      </div>

      <div className={`tablero ${arrastrando ? "arrastrando-activo" : ""}`} aria-busy={pending}>
        {COLUMNAS.map((col) => {
          const enCol = col.hecho
            ? efectivo.filter((t) => col.estados.includes(t.estado)).sort(porResueltoReciente)
            : efectivo.filter((t) => col.estados.includes(t.estado)).sort(porPrioridad);
          const visibles = col.limite ? enCol.slice(0, col.limite) : enCol;
          return (
            <div
              key={col.titulo}
              className={`tablero-col ${col.hecho ? "es-hecho" : ""} ${sobre === col.titulo ? "soltar" : ""}`}
              style={{ "--col-acento": col.acento } as CSSProperties}
              onDragOver={(e) => {
                if (!arrastrando) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (sobre !== col.titulo) setSobre(col.titulo);
              }}
              onDragLeave={(e) => {
                // Only clears when the cursor left the column, not when it moves
                // over a child.
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setSobre((s) => (s === col.titulo ? null : s));
              }}
              onDrop={(e) => alSoltar(e, col.destino, col.estados)}
            >
              <div className="tablero-col-cab">
                <span className="tablero-col-titulo">{col.titulo}</span>
                <span className="tablero-col-num">{enCol.length}</span>
              </div>
              {visibles.length === 0 ? (
                <div className="tablero-col-vacio">
                  {col.hecho ? "Nada archivado aún" : "Sin tickets"}
                </div>
              ) : (
                <div className={`tablero-col-lista ${col.hecho ? "lista-hecho" : ""}`}>
                  {visibles.map(col.hecho ? filaHecha : tarjeta)}
                  {col.limite && enCol.length > col.limite && (
                    <Link href={hrefLista} className="boton-texto tablero-col-mas">
                      Ver {enCol.length - col.limite} más en lista →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Archivados: guardados en frío, recogidos en un acordeón colapsado. Siguen
          siendo arrastrables a una columna para reactivarlos. */}
      {archivados.length > 0 && (
        <details className="tablero-archivados">
          <summary>
            <span className="tablero-archivados-titulo">Archivados</span>
            <span className="tablero-col-num">{archivados.length}</span>
          </summary>
          <div className="tablero-archivados-lista lista-hecho">{archivados.map(filaHecha)}</div>
        </details>
      )}
    </>
  );
}
