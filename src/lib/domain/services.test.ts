import { describe, expect, it } from "vitest";
import {
  criticalityLabel,
  incidentDuration,
  isIncidentOpen,
  serviceStatus,
  servicesSummary,
  servicesWithStatus,
  type Incident,
  type Service,
} from "./services";

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "i1",
    num: 1,
    servicio_id: "s1",
    titulo: "Sin internet",
    descripcion: null,
    tipo: "caida",
    estado: "activo",
    inicio: "2026-03-10T08:00:00.000Z",
    fin: null,
    resolucion: null,
    created_at: "2026-03-10T08:00:00.000Z",
    ...over,
  };
}

function service(over: Partial<Service> = {}): Service {
  return {
    id: "s1",
    nombre: "Internet",
    descripcion: null,
    categoria: "conectividad",
    proveedor: "Telmex",
    criticidad: "critica",
    visible_portal: true,
    orden: 1,
    activo: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("isIncidentOpen", () => {
  it("treats anything that is not resolved as still affecting the service", () => {
    expect(isIncidentOpen({ estado: "activo" })).toBe(true);
    expect(isIncidentOpen({ estado: "vigilando" })).toBe(true);
    expect(isIncidentOpen({ estado: "resuelto" })).toBe(false);
  });
});

describe("serviceStatus", () => {
  it("reports operational when there are no open incidents", () => {
    expect(serviceStatus([]).value).toBe("operativo");
    expect(serviceStatus([incident({ estado: "resuelto" })]).value).toBe("operativo");
  });

  it("lets the highest-ranked active incident win", () => {
    const status = serviceStatus([
      incident({ id: "a", tipo: "mantenimiento" }),
      incident({ id: "b", tipo: "caida" }),
      incident({ id: "c", tipo: "degradado" }),
    ]);
    expect(status.value).toBe("caido");
    expect(status.tone).toBe("critico");
  });

  it("maps each incident type to its own service status", () => {
    expect(serviceStatus([incident({ tipo: "degradado" })]).value).toBe("degradado");
    expect(serviceStatus([incident({ tipo: "mantenimiento" })]).value).toBe("mantenimiento");
  });

  it("falls back to watching once only vigilando incidents remain", () => {
    expect(serviceStatus([incident({ estado: "vigilando" })]).value).toBe("vigilando");
  });

  it("prefers an active incident over one merely being watched", () => {
    const status = serviceStatus([
      incident({ id: "a", estado: "vigilando", tipo: "caida" }),
      incident({ id: "b", estado: "activo", tipo: "mantenimiento" }),
    ]);
    expect(status.value).toBe("mantenimiento");
  });
});

describe("incidentDuration", () => {
  const start = Date.parse("2026-03-10T08:00:00.000Z");

  it("measures a resolved incident from start to end", () => {
    const ms = incidentDuration(
      { inicio: "2026-03-10T08:00:00.000Z", fin: "2026-03-10T11:00:00.000Z" },
      start + 99 * 3_600_000,
    );
    expect(ms).toBe(3 * 3_600_000);
  });

  it("keeps counting an open incident up to now", () => {
    const ms = incidentDuration(
      { inicio: "2026-03-10T08:00:00.000Z", fin: null },
      start + 2 * 3_600_000,
    );
    expect(ms).toBe(2 * 3_600_000);
  });
});

describe("servicesWithStatus", () => {
  it("puts what is down first, then falls back to the catalogue order", () => {
    const services = [
      service({ id: "s1", nombre: "Internet", orden: 3 }),
      service({ id: "s2", nombre: "SAP", orden: 1 }),
      service({ id: "s3", nombre: "Impresión", orden: 2 }),
    ];
    const rows = servicesWithStatus(services, [incident({ servicio_id: "s1", tipo: "caida" })]);
    expect(rows.map((r) => r.servicio.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("attaches only each service's own incidents", () => {
    const rows = servicesWithStatus(
      [service({ id: "s1" }), service({ id: "s2", nombre: "SAP" })],
      [incident({ servicio_id: "s1" })],
    );
    const sap = rows.find((r) => r.servicio.id === "s2");
    expect(sap?.estado.value).toBe("operativo");
    expect(sap?.incidentesAbiertos).toHaveLength(0);
  });

  it("lists a service's open incidents newest first, dropping the resolved ones", () => {
    const [row] = servicesWithStatus(
      [service({ id: "s1" })],
      [
        incident({ id: "old", inicio: "2026-03-01T08:00:00.000Z" }),
        incident({ id: "new", inicio: "2026-03-09T08:00:00.000Z" }),
        incident({ id: "done", estado: "resuelto", inicio: "2026-03-10T08:00:00.000Z" }),
      ],
    );
    expect(row.incidentesAbiertos.map((i) => i.id)).toEqual(["new", "old"]);
  });
});

describe("servicesSummary", () => {
  it("counts what is down separately from what is merely degraded", () => {
    const rows = servicesWithStatus(
      [
        service({ id: "s1" }),
        service({ id: "s2", nombre: "SAP" }),
        service({ id: "s3", nombre: "Wi-Fi" }),
      ],
      [
        incident({ id: "a", servicio_id: "s1", tipo: "caida" }),
        incident({ id: "b", servicio_id: "s2", tipo: "degradado" }),
      ],
    );
    const s = servicesSummary(rows);
    expect(s.total).toBe(3);
    expect(s.caidos).toBe(1);
    expect(s.operativos).toBe(1);
  });
});

describe("criticalityLabel", () => {
  it("falls back to the raw value for something not in the catalogue", () => {
    expect(criticalityLabel("critica")).toBeTruthy();
    expect(criticalityLabel("inventada")).toBe("inventada");
  });
});
