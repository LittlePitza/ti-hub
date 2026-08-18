"use client";

import {
  useState,
  useTransition,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { folio, duracion } from "@/lib/format";
import {
  ESTADOS_ACTIVOS,
  ESTADOS_ARCHIVADOS,
  ORDEN_PRIORIDAD,
  evaluarRespuesta,
  evaluarResolucion,
  type SlaTabla,
} from "@/lib/tickets";
import Insignia from "./Insignia";
import PildoraSla from "./PildoraSla";
import MoverEstado from "./MoverEstado";
import { cambiarEstadoTicket } from "@/app/ti/tickets/actions";

type Tk = {
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

// Carril de prioridad por tarjeta y acento + estado destino de cada columna.
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
  // Cerrar es el final normal del trabajo; Archivar (guardar en frío) se hace con el
  // selector de la tarjeta y vive en el acordeón de abajo, no en una columna.
  {
    titulo: "Cerrados",
    estados: ["cerrado", "resuelto"],
    destino: "cerrado",
    acento: "var(--ok)",
    limite: 8,
    hecho: true,
  },
];

const iniciales = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

// Resueltos: los más recientes arriba; el trabajo terminado se lee como bitácora.
const porResueltoReciente = (a: Tk, b: Tk) =>
  (b.resuelto_at ?? b.created_at).localeCompare(a.resuelto_at ?? a.created_at);

export default function TableroTickets({
  tickets,
  ahora,
  sla,
  porVencerPct,
  hrefLista,
  hayFiltro,
  hrefLimpiar,
}: {
  tickets: Tk[];
  ahora: number;
  sla?: SlaTabla;
  porVencerPct?: number;
  hrefLista: string;
  hayFiltro: boolean;
  hrefLimpiar: string;
}) {
  // Movimientos optimistas: al soltar, la tarjeta cambia de columna al instante;
  // la server action revalida y los datos del servidor confirman el cambio.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  // Un <select>/<input> dentro de un elemento draggable se vuelve inerte (Firefox
  // ni abre el select). Al tocar un control desactivamos el arrastre de la tarjeta
  // por ese gesto y lo restauramos al soltar el cursor.
  const [noArrastrar, setNoArrastrar] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const efectivo = tickets.map((t) => ({ ...t, estado: moves[t.id] ?? t.estado }));

  const fueraDeSla = (t: Tk) =>
    evaluarRespuesta(t, ahora, sla, porVencerPct).semaforo === "incumplido" ||
    evaluarResolucion(t, ahora, sla, porVencerPct).semaforo === "incumplido";

  const activos = efectivo.filter((t) => ESTADOS_ACTIVOS.includes(t.estado as never));
  const archivados = efectivo
    .filter((t) => ESTADOS_ARCHIVADOS.includes(t.estado as never))
    .sort(porResueltoReciente);
  const fueraSla = activos.filter(fueraDeSla).length;
  const sinAsignar = activos.filter((t) => !t.asignado_a).length;
  const porPrioridad = (a: Tk, b: Tk) =>
    (ORDEN_PRIORIDAD[a.prioridad] ?? 9) - (ORDEN_PRIORIDAD[b.prioridad] ?? 9);

  function alSoltar(e: DragEvent, destino: string, estadosCol: string[]) {
    e.preventDefault();
    setSobre(null);
    setArrastrando(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const t = efectivo.find((x) => x.id === id);
    if (!t || estadosCol.includes(t.estado)) return; // misma columna: nada que hacer

    setMoves((m) => ({ ...m, [id]: destino }));
    const fd = new FormData();
    fd.set("id", id);
    fd.set("estado", destino);
    fd.set("nota", "Movido en el tablero");
    startTransition(() => {
      cambiarEstadoTicket(fd);
    });
  }

  // Props de arrastre compartidas por tarjetas activas y filas resueltas.
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

  // Tarjeta completa para el trabajo activo.
  const tarjeta = (t: Tk) => {
    const r = evaluarRespuesta(t, ahora, sla, porVencerPct);
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
          <Insignia valor={t.prioridad} esPrioridad />
        </div>
        <div className="tk-card-meta">
          <Link href={`/ti/tickets/${t.id}`} className="enlace-folio" draggable={false}>
            {folio(t.num)}
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
          <span title={r.pendiente ? `${duracion(r.ms)} sin atender` : duracion(r.ms)}>
            <PildoraSla semaforo={r.semaforo} />
          </span>
        </div>
        <div className="tk-card-pie">
          {t.asignado_a ? (
            <span className="tk-asignado" title={`Asignado a ${t.asignado_a}`}>
              <span className="tk-avatar" aria-hidden>
                {iniciales(t.asignado_a)}
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
          <MoverEstado id={t.id} estado={t.estado} etiqueta={folio(t.num)} />
        </div>
      </article>
    );
  };

  // Fila condensada para el trabajo terminado: el "done" se recoge, no compite.
  const filaHecha = (t: Tk) => {
    const reso = evaluarResolucion(t, ahora, sla, porVencerPct);
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
          {reso.semaforo !== "na" && !reso.pendiente && (
            <span className="tk-done-tiempo" title={`Resuelto en ${duracion(reso.ms)}`}>
              {duracion(reso.ms)}
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
        {pendiente && (
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

      <div className={`tablero ${arrastrando ? "arrastrando-activo" : ""}`} aria-busy={pendiente}>
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
                // Solo limpia si el cursor salió de la columna, no al pasar sobre un hijo.
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
