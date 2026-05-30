import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState, Task } from "../types";
import { UpdateTaskRpu } from "./updateTaskRpu";
import { DetachTaskFromParentRpu } from "./detachTaskFromParentRpu";
import { ToggleTaskArchivedRpu } from "./toggleTaskArchivedRpu";
import { MoveTaskInListRpu } from "./moveTaskInListRpu";
import { MoveTaskInTreeRpu } from "./moveTaskInTreeRpu";
import { MoveTaskAsChildRpu } from "./moveTaskAsChildRpu";
import { RemoveFromPrioRpu } from "./removeFromPrioRpu";
import { MoveInPrioRpu } from "./moveInPrioRpu";
import { AddLooseBookingRpu } from "./addLooseBookingRpu";
import { CreateTaskFromBookingRpu } from "./createTaskFromBookingRpu";
import { UpdateBookingRpu } from "./updateBookingRpu";
import { DeleteBookingRpu } from "./deleteBookingRpu";
import { LinkBookingToTaskRpu } from "./linkBookingToTaskRpu";
import { UpdateSettingsRpu } from "./updateSettingsRpu";
import { UpdateCapacityDefaultsRpu } from "./updateCapacityDefaultsRpu";
import { UpdateDailyCapacityRpu } from "./updateDailyCapacityRpu";
import { SetPrioDurationRpu } from "./setPrioDurationRpu";
import { SaveDayAsTemplateRpu } from "./saveDayAsTemplateRpu";
import { ApplyDayTemplateRpu } from "./applyDayTemplateRpu";
import { DeleteDayTemplateRpu } from "./deleteDayTemplateRpu";
import { ImportTaskspaceRpu } from "./importTaskspaceRpu";
import { SaveTaskspaceRpu } from "./saveTaskspaceRpu";

function t(partial: Partial<Task> & { id: string }): Task {
  return { title: partial.id, status: "Backlog", done: false, treeOrder: 0, listOrder: 0, boardOrder: 0, ...partial };
}
function store(state: Partial<AppState> = {}): TaskspaceStore {
  const s = new TaskspaceStore();
  s.write(normalizeState({ tasks: [], prioTaskIds: [], bookings: [], ...state } as unknown as AppState));
  return s;
}

test("UpdateTask applies a patch", () => {
  const s = store({ tasks: [t({ id: "a" })] });
  new UpdateTaskRpu(s).process({ taskId: "a", patch: { title: "Neu", status: "Ready" } });
  const task = s.read()!.tasks.find((x) => x.id === "a")!;
  assert.equal(task.title, "Neu");
  assert.equal(task.status, "Ready");
});

test("DetachTaskFromParent clears parentId", () => {
  const s = store({ tasks: [t({ id: "p" }), t({ id: "c", parentId: "p" })] });
  new DetachTaskFromParentRpu(s).process({ taskId: "c" });
  assert.equal(s.read()!.tasks.find((x) => x.id === "c")!.parentId, undefined);
});

test("ToggleTaskArchived flips and blocks when active children exist", () => {
  const s = store({ tasks: [t({ id: "p" }), t({ id: "c", parentId: "p" })] });
  new ToggleTaskArchivedRpu(s).process({ taskId: "p" });
  assert.equal(s.read()!.tasks.find((x) => x.id === "p")!.archived ?? false, false, "blocked by active child");
  new ToggleTaskArchivedRpu(s).process({ taskId: "c" });
  assert.equal(s.read()!.tasks.find((x) => x.id === "c")!.archived, true);
});

test("task move RPUs reorder without throwing", () => {
  const s = store({ tasks: [t({ id: "a" }), t({ id: "b" }), t({ id: "p" })] });
  new MoveTaskInListRpu(s).process({ sourceTaskId: "a", targetTaskId: "b" });
  new MoveTaskInTreeRpu(s).process({ sourceTaskId: "a", targetTaskId: "b" });
  new MoveTaskAsChildRpu(s).process({ sourceTaskId: "a", parentId: "p" });
  assert.equal(s.read()!.tasks.find((x) => x.id === "a")!.parentId, "p");
  // cycle guard: cannot move parent under its own descendant
  new MoveTaskAsChildRpu(s).process({ sourceTaskId: "p", parentId: "a" });
  assert.equal(s.read()!.tasks.find((x) => x.id === "p")!.parentId, undefined);
});

test("prio move/remove RPUs", () => {
  const s = store({ tasks: [t({ id: "a" }), t({ id: "b" })], prioTaskIds: ["a", "b"], prioDurations: { a: 30, b: 30 } });
  new MoveInPrioRpu(s).process({ sourceTaskId: "b", targetTaskId: "a" });
  assert.deepEqual(s.read()!.prioTaskIds, ["b", "a"]);
  new RemoveFromPrioRpu(s).process({ taskId: "b" });
  assert.deepEqual(s.read()!.prioTaskIds, ["a"]);
});

test("booking RPUs: add loose, create-task-from-booking, update, link, delete", () => {
  const s = store({ tasks: [t({ id: "tgt" })] });
  new AddLooseBookingRpu(s).process({ label: "Frei", date: "2026-05-30" });
  let booking = s.read()!.bookings[0];
  assert.equal(booking.label, "Frei");

  new UpdateBookingRpu(s).process({ bookingId: booking.id, patch: { durationMinutes: 120 } });
  assert.equal(s.read()!.bookings[0].durationMinutes, 120);

  new LinkBookingToTaskRpu(s).process({ bookingId: booking.id, taskId: "tgt" });
  assert.equal(s.read()!.bookings[0].taskId, "tgt");
  assert.equal(s.read()!.tasks.find((x) => x.id === "tgt")!.status, "Started");

  new AddLooseBookingRpu(s).process({ label: "Zweite", date: "2026-05-30" });
  const loose = s.read()!.bookings.find((b) => b.label === "Zweite")!;
  new CreateTaskFromBookingRpu(s).process({ bookingId: loose.id, targetTaskId: "tgt", mode: "list" });
  assert.ok(s.read()!.tasks.length >= 2, "a task was created from the booking");

  new DeleteBookingRpu(s).process({ bookingId: booking.id });
  assert.ok(!s.read()!.bookings.some((b) => b.id === booking.id));
});

test("settings/capacity/prio-duration RPUs", () => {
  const s = store();
  new UpdateSettingsRpu(s).process({ patch: { visibleDayCount: 21 } });
  assert.equal(s.read()!.settings!.visibleDayCount, 21);
  new UpdateCapacityDefaultsRpu(s).process({ patch: { defaultDayCapacityMinutes: 600 } });
  assert.equal(s.read()!.settings!.defaultDayCapacityMinutes, 600);
  new UpdateDailyCapacityRpu(s).process({ date: "2026-05-30", patch: { dayCapacityMinutes: 300, planningCapacityMinutes: 400 } });
  const cap = s.read()!.dailyCapacities!["2026-05-30"];
  assert.equal(cap.dayCapacityMinutes, 300);
  assert.equal(cap.planningCapacityMinutes, 300, "planning clamped to day");
  new SetPrioDurationRpu(s).process({ taskId: "z", durationMinutes: 75 });
  assert.equal(s.read()!.prioDurations!.z, 75);
});

test("day template RPUs: save, apply, delete", () => {
  const s = store({ bookings: [{ id: "b1", date: "2026-05-30", durationMinutes: 60, label: "Block" }] });
  const saved = new SaveDayAsTemplateRpu(s).process({ date: "2026-05-30", name: "Standard" });
  assert.equal(saved.saved, true);
  assert.equal(saved.count, 1);
  const templateId = s.read()!.dayTemplates![0].id;
  const applied = new ApplyDayTemplateRpu(s).process({ templateId, date: "2026-06-01" });
  assert.equal(applied, 1);
  assert.ok(s.read()!.bookings.some((b) => b.date === "2026-06-01"));
  new DeleteDayTemplateRpu(s).process({ templateId });
  assert.equal(s.read()!.dayTemplates!.length, 0);
});

test("ImportTaskspace parses json into the store; rejects garbage", () => {
  const s = new TaskspaceStore();
  const ok = new ImportTaskspaceRpu(s).process({ json: JSON.stringify({ tasks: [], prioTaskIds: [], bookings: [] }) });
  assert.equal(ok.kind, "ok");
  assert.ok(s.read());
  const bad = new ImportTaskspaceRpu(new TaskspaceStore()).process({ json: "{not json" });
  assert.equal(bad.kind, "error");
});

test("SaveTaskspace hands the store state to the provider", async () => {
  const s = store({ tasks: [t({ id: "a" })] });
  let savedState: unknown = null;
  const fakeProvider = { load: async () => ({ kind: "ok", rawState: s.read()! }), save: async (state: unknown) => { savedState = state; } };
  await new SaveTaskspaceRpu(fakeProvider as never, s).process({});
  assert.ok(savedState, "provider.save received the state");
});
