import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState, Task } from "../types";
import { GetFilteredTreeTasksRpu } from "./getFilteredTreeTasksRpu";
import { GetPrioListRpu } from "./getPrioListRpu";
import { GetDayCapacityRpu } from "./getDayCapacityRpu";

function task(partial: Partial<Task> & { id: string }): Task {
  return { title: partial.id, status: "Backlog", done: false, treeOrder: 0, listOrder: 0, boardOrder: 0, ...partial };
}

function storeWith(state: Partial<AppState>): TaskspaceStore {
  const store = new TaskspaceStore();
  store.write(normalizeState({ tasks: [], prioTaskIds: [], bookings: [], ...state } as unknown as AppState));
  return store;
}

test("GetFilteredTreeTasks filters by status", () => {
  const store = storeWith({
    tasks: [task({ id: "a", status: "Ready" }), task({ id: "b", status: "Backlog" })],
    settings: { treeFilters: { query: "", statuses: ["Ready"], tags: [], showArchived: false } } as unknown as AppState["settings"]
  });
  const result = new GetFilteredTreeTasksRpu(store).process();
  assert.deepEqual(result.map((t) => t.id), ["a"]);
});

test("GetFilteredTreeTasks filters by query text", () => {
  const store = storeWith({
    tasks: [task({ id: "a", title: "Einkaufen" }), task({ id: "b", title: "Putzen" })]
  });
  const store2 = storeWith({
    tasks: [task({ id: "a", title: "Einkaufen" }), task({ id: "b", title: "Putzen" })],
    settings: { treeFilters: { query: "ein", statuses: [], tags: [], showArchived: false } } as unknown as AppState["settings"]
  });
  assert.equal(new GetFilteredTreeTasksRpu(store).process().length, 2);
  assert.deepEqual(new GetFilteredTreeTasksRpu(store2).process().map((t) => t.id), ["a"]);
});

test("GetPrioList resolves order, durations and skips archived", () => {
  const store = storeWith({
    tasks: [
      task({ id: "a", estimateMinutes: 60 }),
      task({ id: "b" }),
      task({ id: "c", archived: true })
    ],
    prioTaskIds: ["b", "a", "c"],
    prioDurations: { a: 45 },
    settings: { defaultPrioDurationMinutes: 30 } as unknown as AppState["settings"]
  });
  const list = new GetPrioListRpu(store).process();
  assert.deepEqual(list.map((e) => e.task.id), ["b", "a"], "order kept, archived skipped");
  assert.equal(list.find((e) => e.task.id === "a")!.durationMinutes, 45, "explicit prio duration");
  assert.equal(list.find((e) => e.task.id === "b")!.durationMinutes, 30, "falls back to default");
});

test("GetDayCapacity sums capcal bookings plus external blocking minutes", () => {
  const store = storeWith({
    bookings: [
      { id: "b1", date: "2026-05-30", durationMinutes: 120 },
      { id: "b2", date: "2026-05-29", durationMinutes: 999 }
    ],
    settings: { defaultDayCapacityMinutes: 480, defaultPlanningCapacityMinutes: 360 } as unknown as AppState["settings"]
  });
  const result = new GetDayCapacityRpu(store).process({
    date: "2026-05-30",
    externalEvents: [
      {
        id: "e",
        provider: "google",
        calendarId: "c",
        calendarSummary: "c",
        summary: "e",
        startAt: "2026-05-30T09:00:00Z",
        endAt: "2026-05-30T10:00:00Z",
        allDay: false,
        blocksTime: true
      }
    ],
    calendarStartMinutes: 360,
    calendarEndMinutes: 1200
  });
  assert.equal(result.capcalMinutes, 120, "only the target day's bookings");
  assert.equal(result.externalMinutes, 60);
  assert.equal(result.bookedMinutes, 180);
  assert.equal(result.isOverbooked, false);
});
