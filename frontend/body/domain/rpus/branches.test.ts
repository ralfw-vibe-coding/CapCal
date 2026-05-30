import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState, Task } from "../types";
import { CreateTaskFromBookingRpu } from "./createTaskFromBookingRpu";
import { BookTaskRpu } from "./bookTaskRpu";
import { AddLooseBookingRpu } from "./addLooseBookingRpu";
import { UpdateSettingsRpu } from "./updateSettingsRpu";
import { UpdateCapacityDefaultsRpu } from "./updateCapacityDefaultsRpu";
import { GetFilteredTreeTasksRpu } from "./getFilteredTreeTasksRpu";
import { GetDayCapacityRpu } from "./getDayCapacityRpu";
import { MoveInPrioRpu } from "./moveInPrioRpu";
import { SaveDayAsTemplateRpu } from "./saveDayAsTemplateRpu";

function t(p: Partial<Task> & { id: string }): Task {
  return { title: p.id, status: "Backlog", done: false, treeOrder: 0, listOrder: 0, boardOrder: 0, ...p };
}
function store(state: Partial<AppState> = {}): TaskspaceStore {
  const s = new TaskspaceStore();
  s.write(normalizeState({ tasks: [], prioTaskIds: [], bookings: [], ...state } as unknown as AppState));
  return s;
}

test("CreateTaskFromBooking: board and hierarchy modes", () => {
  for (const mode of ["board", "hierarchy", "list"] as const) {
    const s = store({
      tasks: [t({ id: "tgt", status: "Ready", parentId: undefined })],
      bookings: [{ id: "b", label: "Frei", date: "2026-05-30", durationMinutes: 30 }]
    });
    new CreateTaskFromBookingRpu(s).process({ bookingId: "b", targetTaskId: "tgt", mode });
    assert.ok(s.read()!.tasks.length >= 2, `mode ${mode} created a task`);
  }
});

test("BookTask with source tree uses the task planning duration", () => {
  const s = store({ tasks: [t({ id: "a", estimateMinutes: 90 })], settings: { defaultPrioDurationMinutes: 30 } as unknown as AppState["settings"] });
  new BookTaskRpu(s).process({ taskId: "a", date: "2026-05-30", source: "tree", startTime: "09:00" });
  assert.equal(s.read()!.bookings[0].durationMinutes, 90);
  assert.equal(s.read()!.bookings[0].startTime, "09:00");
});

test("AddLooseBooking defaults the date to today", () => {
  const s = store();
  new AddLooseBookingRpu(s).process({ label: "X" });
  assert.match(s.read()!.bookings[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test("UpdateSettings merges treeFilters, panels and board hidden statuses", () => {
  const s = store();
  new UpdateSettingsRpu(s).process({
    patch: {
      treeFilters: { query: "q", statuses: ["Ready"], tags: ["x"], showArchived: true },
      panelsCollapsed: { tree: true, prio: false, cal: false },
      boardHiddenStatuses: ["Done"]
    }
  });
  const settings = s.read()!.settings!;
  assert.equal(settings.treeFilters.query, "q");
  assert.equal(settings.panelsCollapsed.tree, true);
  assert.deepEqual(settings.boardHiddenStatuses, ["Done"]);
});

test("UpdateCapacityDefaults clamps planning to day and backfills booked dates", () => {
  const s = store({ bookings: [{ id: "b", date: "2026-05-30", durationMinutes: 60 }] });
  new UpdateCapacityDefaultsRpu(s).process({ patch: { defaultDayCapacityMinutes: 480, defaultPlanningCapacityMinutes: 999 } });
  assert.equal(s.read()!.settings!.defaultPlanningCapacityMinutes, 480, "planning clamped to day");
  assert.ok(s.read()!.dailyCapacities!["2026-05-30"], "booked date backfilled");
});

test("GetFilteredTreeTasks honours board and hierarchy view visibility", () => {
  const base = {
    tasks: [t({ id: "p" }), t({ id: "c", parentId: "p" })]
  };
  const board = store({ ...base, settings: { taskView: "board" } as unknown as AppState["settings"] });
  assert.ok(new GetFilteredTreeTasksRpu(board).process().length >= 1);
  const hierarchy = store({ ...base, settings: { taskView: "hierarchy" } as unknown as AppState["settings"] });
  assert.ok(new GetFilteredTreeTasksRpu(hierarchy).process().some((x) => x.id === "c"));
});

test("GetDayCapacity flags overbooked days", () => {
  const s = store({
    bookings: [{ id: "b", date: "2026-05-30", durationMinutes: 600 }],
    settings: { defaultDayCapacityMinutes: 480, defaultPlanningCapacityMinutes: 360 } as unknown as AppState["settings"]
  });
  const result = new GetDayCapacityRpu(s).process({ date: "2026-05-30", externalEvents: [], calendarStartMinutes: 360, calendarEndMinutes: 1200 });
  assert.equal(result.isOverbooked, true);
  assert.equal(result.level, "over-plan");
});

test("MoveInPrio keeps an already-prioritised source (no re-add)", () => {
  const s = store({ tasks: [t({ id: "a" }), t({ id: "b" })], prioTaskIds: ["a", "b"], prioDurations: { a: 30, b: 30 } });
  new MoveInPrioRpu(s).process({ sourceTaskId: "a", targetTaskId: "b" });
  assert.deepEqual(s.read()!.prioTaskIds, ["b", "a"]);
});

test("SaveDayAsTemplate falls back to a default slot label", () => {
  const s = store({ bookings: [{ id: "b", date: "2026-05-30", durationMinutes: 60, label: "" }] });
  new SaveDayAsTemplateRpu(s).process({ date: "2026-05-30", name: "Tag" });
  assert.equal(s.read()!.dayTemplates![0].slots[0].label, "Reservierung");
});
