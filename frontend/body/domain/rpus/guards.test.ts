import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { CreateTaskRpu } from "./createTaskRpu";
import { UpdateTaskRpu } from "./updateTaskRpu";
import { DeleteTaskRpu } from "./deleteTaskRpu";
import { ToggleTaskArchivedRpu } from "./toggleTaskArchivedRpu";
import { DetachTaskFromParentRpu } from "./detachTaskFromParentRpu";
import { AddToPrioRpu } from "./addToPrioRpu";
import { RemoveFromPrioRpu } from "./removeFromPrioRpu";
import { MoveInPrioRpu } from "./moveInPrioRpu";
import { MoveTaskInListRpu } from "./moveTaskInListRpu";
import { MoveTaskInTreeRpu } from "./moveTaskInTreeRpu";
import { MoveTaskAsChildRpu } from "./moveTaskAsChildRpu";
import { MoveTaskToBoardStatusRpu } from "./moveTaskToBoardStatusRpu";
import { BookTaskRpu } from "./bookTaskRpu";
import { AddLooseBookingRpu } from "./addLooseBookingRpu";
import { UpdateBookingRpu } from "./updateBookingRpu";
import { DeleteBookingRpu } from "./deleteBookingRpu";
import { LinkBookingToTaskRpu } from "./linkBookingToTaskRpu";
import { CreateTaskFromBookingRpu } from "./createTaskFromBookingRpu";
import { UpdateSettingsRpu } from "./updateSettingsRpu";
import { UpdateCapacityDefaultsRpu } from "./updateCapacityDefaultsRpu";
import { UpdateDailyCapacityRpu } from "./updateDailyCapacityRpu";
import { SetPrioDurationRpu } from "./setPrioDurationRpu";
import { SaveDayAsTemplateRpu } from "./saveDayAsTemplateRpu";
import { ApplyDayTemplateRpu } from "./applyDayTemplateRpu";
import { DeleteDayTemplateRpu } from "./deleteDayTemplateRpu";

// Alle mutierenden RPUs auf einem leeren Store: der "kein State"-Zweig darf
// nichts schreiben und nicht werfen.
test("command RPUs are safe no-ops on an empty store", () => {
  const s = new TaskspaceStore();
  assert.equal(new CreateTaskRpu(s).process({ title: "x" }), null);
  new UpdateTaskRpu(s).process({ taskId: "a", patch: {} });
  new DeleteTaskRpu(s).process({ taskId: "a" });
  new ToggleTaskArchivedRpu(s).process({ taskId: "a" });
  new DetachTaskFromParentRpu(s).process({ taskId: "a" });
  new AddToPrioRpu(s).process({ taskId: "a" });
  new RemoveFromPrioRpu(s).process({ taskId: "a" });
  new MoveInPrioRpu(s).process({ sourceTaskId: "a", targetTaskId: "b" });
  new MoveTaskInListRpu(s).process({ sourceTaskId: "a", targetTaskId: "b" });
  new MoveTaskInTreeRpu(s).process({ sourceTaskId: "a", targetTaskId: "b" });
  new MoveTaskAsChildRpu(s).process({ sourceTaskId: "a", parentId: "b" });
  new MoveTaskToBoardStatusRpu(s).process({ taskId: "a", status: "Ready" });
  new BookTaskRpu(s).process({ taskId: "a", date: "2026-05-30" });
  new AddLooseBookingRpu(s).process({ label: "x" });
  new UpdateBookingRpu(s).process({ bookingId: "b", patch: {} });
  new DeleteBookingRpu(s).process({ bookingId: "b" });
  new LinkBookingToTaskRpu(s).process({ bookingId: "b", taskId: "a" });
  new CreateTaskFromBookingRpu(s).process({ bookingId: "b", targetTaskId: "a" });
  new UpdateSettingsRpu(s).process({ patch: {} });
  new UpdateCapacityDefaultsRpu(s).process({ patch: {} });
  new UpdateDailyCapacityRpu(s).process({ date: "2026-05-30", patch: {} });
  new SetPrioDurationRpu(s).process({ taskId: "a", durationMinutes: 30 });
  new DeleteDayTemplateRpu(s).process({ templateId: "t" });
  assert.equal(new SaveDayAsTemplateRpu(s).process({ date: "2026-05-30", name: "x" }).saved, false);
  assert.equal(new ApplyDayTemplateRpu(s).process({ templateId: "t", date: "2026-05-30" }), 0);
  assert.equal(s.read(), null, "store still empty");
});

test("AddToPrio is a no-op when the task is missing", () => {
  const s = new TaskspaceStore();
  s.write({ settings: undefined, tasks: [], prioTaskIds: [], prioDurations: {}, bookings: [], dailyCapacities: {}, dayTemplates: [] } as never);
  new AddToPrioRpu(s).process({ taskId: "missing" });
  assert.deepEqual(s.read()!.prioTaskIds, []);
});

test("SaveDayAsTemplate rejects an empty name", () => {
  const s = new TaskspaceStore();
  s.write({ settings: undefined, tasks: [], prioTaskIds: [], prioDurations: {}, bookings: [], dailyCapacities: {}, dayTemplates: [] } as never);
  assert.equal(new SaveDayAsTemplateRpu(s).process({ date: "2026-05-30", name: "  " }).saved, false);
});
