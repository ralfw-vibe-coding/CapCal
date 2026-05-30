import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStore } from "../taskspaceStore";
import { normalizeState } from "../state";
import type { AppState, Task } from "../types";
import { ConvertChecklistItemToTaskRpu } from "./convertChecklistItemToTaskRpu";

function t(p: Partial<Task> & { id: string }): Task {
  return { title: p.id, status: "Backlog", done: false, treeOrder: 0, listOrder: 0, boardOrder: 0, ...p };
}
function store(state: Partial<AppState>): TaskspaceStore {
  const s = new TaskspaceStore();
  s.write(normalizeState({ tasks: [], prioTaskIds: [], bookings: [], ...state } as unknown as AppState));
  return s;
}

test("converts a checklist item into a Backlog sub-task as the first child", () => {
  const s = store({
    tasks: [
      t({
        id: "p",
        status: "Started",
        checklist: [
          { id: "i1", text: "Milch kaufen", done: false },
          { id: "i2", text: "Brot kaufen", done: false }
        ]
      }),
      t({ id: "existing", parentId: "p", treeOrder: 0 })
    ]
  });

  const created = new ConvertChecklistItemToTaskRpu(s).process({ parentTaskId: "p", checklistItemId: "i1" });
  assert.ok(created);
  assert.equal(created!.title, "Milch kaufen");
  assert.equal(created!.parentId, "p");
  assert.equal(created!.status, "Backlog");

  const after = s.read()!;
  // remaining checklist no longer holds the converted item
  const parent = after.tasks.find((x) => x.id === "p")!;
  assert.deepEqual((parent.checklist ?? []).map((i) => i.id), ["i2"]);

  // new sub-task is the first child (treeOrder 0), the existing child moved behind
  const children = after.tasks
    .filter((x) => x.parentId === "p")
    .sort((a, b) => a.treeOrder - b.treeOrder);
  assert.equal(children[0].id, created!.id, "converted item is first child");
  assert.equal(children[0].treeOrder, 0);
  assert.equal(children[1].id, "existing");
});

test("no-op for missing task, missing item or empty text", () => {
  const s = store({
    tasks: [t({ id: "p", checklist: [{ id: "blank", text: "   ", done: false }] })]
  });
  const rpu = new ConvertChecklistItemToTaskRpu(s);
  assert.equal(rpu.process({ parentTaskId: "nope", checklistItemId: "i1" }), null);
  assert.equal(rpu.process({ parentTaskId: "p", checklistItemId: "missing" }), null);
  assert.equal(rpu.process({ parentTaskId: "p", checklistItemId: "blank" }), null, "empty text not converted");
  assert.equal(s.read()!.tasks.length, 1, "no task added");
});

test("no-op on an empty store", () => {
  const s = new TaskspaceStore();
  assert.equal(new ConvertChecklistItemToTaskRpu(s).process({ parentTaskId: "p", checklistItemId: "i" }), null);
});
