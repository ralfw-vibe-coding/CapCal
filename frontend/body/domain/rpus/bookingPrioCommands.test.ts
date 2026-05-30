import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState, Task } from "../types";
import { AddToPrioRpu } from "./addToPrioRpu";
import { BookTaskRpu } from "./bookTaskRpu";
import { MoveTaskToBoardStatusRpu } from "./moveTaskToBoardStatusRpu";

function task(partial: Partial<Task> & { id: string }): Task {
  return { title: partial.id, status: "Backlog", done: false, treeOrder: 0, listOrder: 0, boardOrder: 0, ...partial };
}

function storeWith(state: Partial<AppState>): TaskspaceStore {
  const store = new TaskspaceStore();
  store.write(normalizeState({ tasks: [], prioTaskIds: [], bookings: [], ...state } as unknown as AppState));
  return store;
}

test("AddToPrio adds the task, advances its status and sets a planning duration", () => {
  const store = storeWith({ tasks: [task({ id: "a", status: "Backlog", estimateMinutes: 60 })] });
  new AddToPrioRpu(store).process({ taskId: "a" });
  const state = store.read()!;
  assert.deepEqual(state.prioTaskIds, ["a"]);
  assert.equal(state.tasks.find((t) => t.id === "a")!.status, "Ready", "Backlog advanced to Ready");
  assert.equal(state.prioDurations?.a, 60);
});

test("AddToPrio is a no-op for archived or already-prioritised tasks", () => {
  const store = storeWith({ tasks: [task({ id: "a", archived: true })], prioTaskIds: [] });
  new AddToPrioRpu(store).process({ taskId: "a" });
  assert.deepEqual(store.read()!.prioTaskIds, []);
});

test("BookTask removes from prio, sets Started and appends a booking", () => {
  const store = storeWith({
    tasks: [task({ id: "a", status: "Ready" })],
    prioTaskIds: ["a"],
    prioDurations: { a: 45 }
  });
  new BookTaskRpu(store).process({ taskId: "a", date: "2026-05-30", source: "prio" });
  const state = store.read()!;
  assert.deepEqual(state.prioTaskIds, [], "removed from prio");
  assert.equal(state.tasks.find((t) => t.id === "a")!.status, "Started");
  assert.equal(state.bookings.length, 1);
  assert.equal(state.bookings[0].durationMinutes, 45, "uses the prio planning duration");
  assert.equal(state.bookings[0].date, "2026-05-30");
});

test("MoveTaskToBoardStatus changes status and orders within the column", () => {
  const store = storeWith({
    tasks: [task({ id: "a", status: "Backlog" }), task({ id: "b", status: "Ready" })]
  });
  new MoveTaskToBoardStatusRpu(store).process({ taskId: "a", status: "Ready" });
  const a = store.read()!.tasks.find((t) => t.id === "a")!;
  assert.equal(a.status, "Ready");
});
