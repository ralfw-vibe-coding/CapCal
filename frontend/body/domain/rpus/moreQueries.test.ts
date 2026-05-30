import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState, Task } from "../types";
import { GetTaskMetricsRpu } from "./getTaskMetricsRpu";
import { GetTasksByParentRpu } from "./getTasksByParentRpu";
import { GetAvailableTagsRpu } from "./getAvailableTagsRpu";
import { GetVisibleBoardStatusesRpu } from "./getVisibleBoardStatusesRpu";
import { GetSettingsRpu } from "./getSettingsRpu";
import { GetTaskByIdMapRpu } from "./getTaskByIdMapRpu";
import { GetStatusCountsRpu } from "./getStatusCountsRpu";
import { GetBookingsForDateRpu } from "./getBookingsForDateRpu";
import { GetDayTemplatesRpu } from "./getDayTemplatesRpu";
import { GetRevisionRpu } from "./getRevisionRpu";
import { GetTaskspaceRpu } from "./getTaskspaceRpu";

function t(partial: Partial<Task> & { id: string }): Task {
  return { title: partial.id, status: "Backlog", done: false, treeOrder: 0, listOrder: 0, boardOrder: 0, ...partial };
}

function store(): TaskspaceStore {
  const s = new TaskspaceStore();
  s.write(
    normalizeState({
      tasks: [
        t({ id: "p", tags: ["a", "b"] }),
        t({ id: "c", parentId: "p", status: "Started", tags: ["b"] }),
        t({ id: "x", status: "Blocked", archived: true })
      ],
      prioTaskIds: [],
      bookings: [
        { id: "b1", taskId: "c", date: "2026-05-30", durationMinutes: 60 },
        { id: "b2", date: "2026-05-29", durationMinutes: 30 }
      ],
      dayTemplates: [{ id: "tpl", name: "Mo", slots: [{ label: "x", durationMinutes: 60 }], createdAt: "2026-01-01" }],
      settings: { boardHiddenStatuses: ["Aborted"] } as unknown as AppState["settings"]
    } as unknown as AppState)
  );
  return s;
}

test("GetTaskMetrics computes booking/child counts and parent titles", () => {
  const m = new GetTaskMetricsRpu(store()).process();
  assert.equal(m.bookingCountByTaskId.get("c"), 1);
  assert.equal(m.childCountByTaskId.get("p"), 1);
  assert.equal(m.activeChildCountByTaskId.get("p"), 1);
  assert.equal(m.parentTitleByTaskId.get("c"), "p");
});

test("GetTasksByParent groups children under parent key", () => {
  const byParent = new GetTasksByParentRpu(store()).process();
  assert.deepEqual((byParent.get("p") ?? []).map((x) => x.id), ["c"]);
  assert.ok((byParent.get("") ?? []).length >= 1);
});

test("GetAvailableTags returns sorted unique tags", () => {
  assert.deepEqual(new GetAvailableTagsRpu(store()).process(), ["a", "b"]);
});

test("GetVisibleBoardStatuses drops hidden statuses", () => {
  assert.ok(!new GetVisibleBoardStatusesRpu(store()).process().includes("Aborted"));
});

test("GetSettings returns settings, GetTaskById indexes, counts and bookings", () => {
  assert.equal(new GetSettingsRpu(store()).process().taskView, "list");
  assert.equal(new GetTaskByIdMapRpu(store()).process().get("p")!.id, "p");
  const counts = new GetStatusCountsRpu(store()).process();
  assert.equal(counts.started, 1);
  assert.equal(counts.blocked, 1);
  assert.equal(new GetBookingsForDateRpu(store()).process({ date: "2026-05-30" }).length, 1);
  assert.equal(new GetDayTemplatesRpu(store()).process().length, 1);
});

test("GetRevision and GetTaskspace reflect the store", () => {
  const s = store();
  assert.ok(new GetRevisionRpu(s).process() > 0);
  assert.ok(new GetTaskspaceRpu(s).process());
  const empty = new TaskspaceStore();
  assert.equal(new GetTaskspaceRpu(empty).process(), null);
  assert.equal(new GetRevisionRpu(empty).process(), 0);
});
