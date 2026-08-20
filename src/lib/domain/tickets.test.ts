import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  RESOLVED_STATUSES,
  SLA_DEFAULTS,
  SLA_STATUS_TEXT,
  TICKET_STATUSES,
  evaluateResolution,
  evaluateResponse,
  isActiveStatus,
  isArchivedStatus,
  isClosedStatus,
  isPriority,
  isResolvedStatus,
  isTicketCategory,
  isUnattendedStatus,
  statusMeta,
  type SlaTicket,
} from "./tickets";

const HOUR = 3_600_000;
const CREATED = "2026-03-01T00:00:00.000Z";
const created = new Date(CREATED).getTime();

function ticket(over: Partial<SlaTicket> = {}): SlaTicket {
  return { prioridad: "media", estado: "abierto", created_at: CREATED, ...over };
}

describe("status predicates", () => {
  it("agrees with the catalogue about what is still active work", () => {
    for (const s of TICKET_STATUSES) {
      expect(isActiveStatus(s.value)).toBe(ACTIVE_STATUSES.includes(s.value));
      expect(isResolvedStatus(s.value)).toBe(RESOLVED_STATUSES.includes(s.value));
    }
  });

  it("keeps closed and archived apart — archived leaves the visible workload", () => {
    expect(isClosedStatus("cerrado")).toBe(true);
    expect(isArchivedStatus("cerrado")).toBe(false);
    expect(isArchivedStatus("archivado")).toBe(true);
    expect(isClosedStatus("archivado")).toBe(false);
  });

  it("treats only the pre-contact statuses as unattended", () => {
    expect(isUnattendedStatus("abierto")).toBe(true);
    expect(isUnattendedStatus("reabierto")).toBe(true);
    expect(isUnattendedStatus("en_proceso")).toBe(false);
  });

  it("rejects values that are not in the catalogue", () => {
    expect(isActiveStatus("no_existe")).toBe(false);
    expect(isPriority("urgentisima")).toBe(false);
    expect(isTicketCategory("plomeria")).toBe(false);
    expect(isPriority("critica")).toBe(true);
    expect(isTicketCategory("hardware")).toBe(true);
  });

  it("falls back to the first status rather than returning undefined", () => {
    expect(statusMeta("no_existe")).toBe(TICKET_STATUSES[0]);
    expect(statusMeta("cerrado").value).toBe("cerrado");
  });
});

describe("evaluateResponse", () => {
  it("grades a stamped first response against the target, ignoring now", () => {
    const target = SLA_DEFAULTS.media.respuesta;
    const onTime = evaluateResponse(
      ticket({ primera_respuesta_at: new Date(created + (target - 1) * HOUR).toISOString() }),
      created + 999 * HOUR,
    );
    expect(onTime.slaStatus).toBe("cumplido");
    expect(onTime.pending).toBe(false);

    const late = evaluateResponse(
      ticket({ primera_respuesta_at: new Date(created + (target + 1) * HOUR).toISOString() }),
      created + 999 * HOUR,
    );
    expect(late.slaStatus).toBe("incumplido");
  });

  it("walks an unanswered ticket from on-time to due-soon to breached", () => {
    const target = SLA_DEFAULTS.media.respuesta; // 8 h, due-soon at 80% = 6.4 h
    expect(evaluateResponse(ticket(), created + 1 * HOUR).slaStatus).toBe("en_tiempo");
    expect(evaluateResponse(ticket(), created + 7 * HOUR).slaStatus).toBe("por_vencer");
    expect(evaluateResponse(ticket(), created + (target + 1) * HOUR).slaStatus).toBe("incumplido");
  });

  it("pauses the clock while the ticket is on hold", () => {
    const r = evaluateResponse(ticket({ estado: "en_espera" }), created + 999 * HOUR);
    expect(r.slaStatus).toBe("pausado");
    expect(r.pending).toBe(true);
  });

  it("honours an SLA overridden from the panel", () => {
    const strict = { ...SLA_DEFAULTS, media: { respuesta: 1, resolucion: 4 } };
    expect(evaluateResponse(ticket(), created + 2 * HOUR, strict).slaStatus).toBe("incumplido");
    expect(evaluateResponse(ticket(), created + 2 * HOUR).slaStatus).toBe("en_tiempo");
  });

  it("falls back to the media target for an unknown priority", () => {
    const r = evaluateResponse(ticket({ prioridad: "inventada" }), created);
    expect(r.targetMs).toBe(SLA_DEFAULTS.media.respuesta * HOUR);
  });
});

describe("evaluateResolution", () => {
  it("grades a stamped resolution against the target", () => {
    const target = SLA_DEFAULTS.alta.resolucion;
    const r = evaluateResolution(
      ticket({
        prioridad: "alta",
        estado: "cerrado",
        resuelto_at: new Date(created + (target - 1) * HOUR).toISOString(),
      }),
      created + 999 * HOUR,
    );
    expect(r.slaStatus).toBe("cumplido");
  });

  it("reports n/a for a terminal ticket that never got a resolution stamp", () => {
    const r = evaluateResolution(ticket({ estado: "archivado" }), created + 999 * HOUR);
    expect(r.slaStatus).toBe("na");
    expect(r.pending).toBe(false);
  });

  it("keeps counting while the ticket is still open", () => {
    const r = evaluateResolution(ticket({ estado: "en_proceso" }), created + 1 * HOUR);
    expect(r.pending).toBe(true);
    expect(r.ms).toBe(1 * HOUR);
  });
});

describe("SLA_STATUS_TEXT", () => {
  it("covers every indicator either evaluator can produce", () => {
    for (const s of [
      "cumplido",
      "en_tiempo",
      "por_vencer",
      "incumplido",
      "pausado",
      "na",
    ] as const) {
      expect(SLA_STATUS_TEXT[s]).toBeDefined();
      expect(SLA_STATUS_TEXT[s].tone).toBeTruthy();
    }
  });
});
