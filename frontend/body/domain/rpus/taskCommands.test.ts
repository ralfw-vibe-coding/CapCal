import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState } from "../types";
import { CreateTaskRpu } from "./createTaskRpu";
import { DeleteTaskRpu } from "./deleteTaskRpu";
import { GetBookedMinutesByTaskRpu } from "./getBookedMinutesByTaskRpu";

function freshStore(): TaskspaceStore {
  const store = new TaskspaceStore();
  store.write(normalizeState({ tasks: [], prioTaskIds: [], bookings: [] } as unknown as AppState));
  return store;
}

test("CreateTaskRpu adds a task with the given title and bumps revision", () => {
  const store = freshStore();
  const before = store.revision();
  const created = new CreateTaskRpu(store).process({ title: "  Einkaufen  " });
  assert.ok(created, "returns the created task");
  assert.equal(created!.title, "Einkaufen");
  assert.equal(store.read()!.tasks.length, 1);
  assert.ok(store.revision() > before, "write bumped the revision");
});

test("CreateTaskRpu rejects empty title (no-op)", () => {
  const store = freshStore();
  const created = new CreateTaskRpu(store).process({ title: "   " });
  assert.equal(created, null);
  assert.equal(store.read()!.tasks.length, 0);
});

test("DeleteTaskRpu refuses to delete a task that still has children", () => {
  const store = freshStore();
  const parent = new CreateTaskRpu(store).process({ title: "Parent" })!;
  new CreateTaskRpu(store).process({ title: "Child", parentId: parent.id });
  const revBefore = store.revision();

  new DeleteTaskRpu(store).process({ taskId: parent.id });
  assert.equal(store.read()!.tasks.length, 2, "parent with child is not deleted");
  assert.equal(store.revision(), revBefore, "no-op did not write");
});

test("DeleteTaskRpu removes a leaf task and its prio/booking traces", () => {
  const store = freshStore();
  const a = new CreateTaskRpu(store).process({ title: "A" })!;
  const b = new CreateTaskRpu(store).process({ title: "B" })!;
  const state = store.read()!;
  store.write({
    ...state,
    prioTaskIds: [a.id],
    prioDurations: { [a.id]: 30 },
    bookings: [{ id: "bk", taskId: a.id, date: "2026-05-30", durationMinutes: 30 }]
  });

  new DeleteTaskRpu(store).process({ taskId: a.id });
  const after = store.read()!;
  assert.ok(!after.tasks.some((t) => t.id === a.id), "task removed");
  assert.deepEqual(after.prioTaskIds, [], "prio entry removed");
  assert.equal(after.bookings.length, 0, "bookings of the task removed");
  assert.ok(after.tasks.some((t) => t.id === b.id), "other task kept");
});

test("GetBookedMinutesByTaskRpu rolls booked minutes up the parent chain", () => {
  const store = freshStore();
  const parent = new CreateTaskRpu(store).process({ title: "Parent" })!;
  const child = new CreateTaskRpu(store).process({ title: "Child", parentId: parent.id })!;
  const state = store.read()!;
  store.write({
    ...state,
    bookings: [{ id: "b1", taskId: child.id, date: "2026-05-30", durationMinutes: 90 }]
  });

  const minutes = new GetBookedMinutesByTaskRpu(store).process();
  assert.equal(minutes.get(child.id), 90, "child holds its own minutes");
  assert.equal(minutes.get(parent.id), 90, "parent inherits the child's minutes");
});
