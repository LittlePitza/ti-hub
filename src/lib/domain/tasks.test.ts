import { describe, expect, it } from "vitest";
import {
  BUCKETS,
  bucketForTask,
  groupPending,
  isTaskDone,
  isTaskOverdue,
  projectProgress,
  projectStatusMeta,
  tasksSummary,
  type Task,
} from "./tasks";

const TODAY = "2026-03-10";

function task(over: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    titulo: "Revisar switch",
    notas: null,
    proyecto_id: null,
    prioridad: "normal",
    fecha_limite: null,
    completada_at: null,
    created_at: "2026-03-01T10:00:00.000Z",
    ...over,
  };
}

describe("isTaskDone", () => {
  it("derives completion from the timestamp, with no separate boolean", () => {
    expect(isTaskDone(task())).toBe(false);
    expect(isTaskDone(task({ completada_at: "2026-03-09T10:00:00.000Z" }))).toBe(true);
  });
});

describe("bucketForTask", () => {
  it("sorts a deadline into the right bucket", () => {
    expect(bucketForTask(task({ fecha_limite: "2026-03-09" }), TODAY)).toBe("vencidas");
    expect(bucketForTask(task({ fecha_limite: TODAY }), TODAY)).toBe("hoy");
    expect(bucketForTask(task({ fecha_limite: "2026-03-15" }), TODAY)).toBe("semana");
    expect(bucketForTask(task({ fecha_limite: "2026-04-01" }), TODAY)).toBe("despues");
    expect(bucketForTask(task(), TODAY)).toBe("sin_fecha");
  });

  it("puts the seventh day inside the week and the eighth outside it", () => {
    expect(bucketForTask(task({ fecha_limite: "2026-03-17" }), TODAY)).toBe("semana");
    expect(bucketForTask(task({ fecha_limite: "2026-03-18" }), TODAY)).toBe("despues");
  });

  it("counts across a month boundary without slipping", () => {
    expect(bucketForTask(task({ fecha_limite: "2026-03-05" }), "2026-02-28")).toBe("semana");
  });
});

describe("isTaskOverdue", () => {
  it("only flags a pending task whose deadline has passed", () => {
    expect(isTaskOverdue(task({ fecha_limite: "2026-03-09" }), TODAY)).toBe(true);
    expect(isTaskOverdue(task({ fecha_limite: TODAY }), TODAY)).toBe(false);
    expect(isTaskOverdue(task(), TODAY)).toBe(false);
  });

  it("never flags a task that is already done", () => {
    const done = task({ fecha_limite: "2026-01-01", completada_at: "2026-03-01T00:00:00.000Z" });
    expect(isTaskOverdue(done, TODAY)).toBe(false);
  });
});

describe("groupPending", () => {
  it("omits empty buckets and keeps the catalogue order", () => {
    const groups = groupPending(
      [task({ fecha_limite: "2026-03-09" }), task({ fecha_limite: "2026-04-01" })],
      TODAY,
    );
    expect(groups.map((g) => g.cubo)).toEqual(["vencidas", "despues"]);
  });

  it("leaves completed tasks out entirely", () => {
    const groups = groupPending([task({ completada_at: "2026-03-09T00:00:00.000Z" })], TODAY);
    expect(groups).toEqual([]);
  });

  it("orders within a bucket by date, then priority, then age", () => {
    const groups = groupPending(
      [
        task({ id: "c", fecha_limite: "2026-04-02", prioridad: "normal" }),
        task({ id: "a", fecha_limite: "2026-04-01", prioridad: "normal" }),
        task({ id: "b", fecha_limite: "2026-04-01", prioridad: "alta" }),
      ],
      TODAY,
    );
    expect(groups[0].tareas.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("sinks undated tasks below dated ones", () => {
    const groups = groupPending(
      [task({ id: "sin" }), task({ id: "con", fecha_limite: "2026-04-01" })],
      TODAY,
    );
    expect(groups.map((g) => g.cubo)).toEqual(["despues", "sin_fecha"]);
  });

  it("carries the bucket label and tone through for rendering", () => {
    const [group] = groupPending([task({ fecha_limite: "2026-03-01" })], TODAY);
    const meta = BUCKETS.find((b) => b.value === "vencidas");
    expect(group.label).toBe(meta?.label);
    expect(group.tone).toBe(meta?.tone);
  });
});

describe("projectProgress", () => {
  it("counts done against total", () => {
    const p = projectProgress(
      [task({ completada_at: "2026-03-01T00:00:00.000Z" }), task(), task()],
      TODAY,
    );
    expect(p.total).toBe(3);
    expect(p.hechas).toBe(1);
    expect(p.pct).toBe(33);
  });

  it("reports zero rather than dividing by zero on an empty project", () => {
    const p = projectProgress([], TODAY);
    expect(p.total).toBe(0);
    expect(p.pct).toBe(0);
  });
});

describe("tasksSummary", () => {
  it("separates what is pending from what is overdue and what is due today", () => {
    const s = tasksSummary(
      [
        task({ fecha_limite: "2026-03-01" }),
        task({ fecha_limite: TODAY }),
        task({ fecha_limite: "2026-04-01" }),
        task({ completada_at: "2026-03-09T00:00:00.000Z" }),
      ],
      TODAY,
    );
    expect(s.pendientes).toBe(3);
    expect(s.vencidas).toBe(1);
    expect(s.hoy).toBe(1);
  });
});

describe("projectStatusMeta", () => {
  it("falls back to the first status rather than returning undefined", () => {
    expect(projectStatusMeta("activo").value).toBe("activo");
    expect(projectStatusMeta("no_existe").value).toBe("activo");
  });
});
