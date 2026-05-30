import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTags, statusAfterMoveToPrio, durationForPlanning, normalizeTasks } from "./tasks";
import type { Task } from "./types";

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: partial.id,
    status: "Backlog",
    done: false,
    treeOrder: 0,
    listOrder: 0,
    boardOrder: 0,
    ...partial
  };
}

test("normalizeTags trims, dedupes and drops empties", () => {
  assert.deepEqual(normalizeTags([" a ", "a", "", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeTags("x, y , x"), ["x", "y"]);
  assert.deepEqual(normalizeTags(null), []);
});

test("statusAfterMoveToPrio advances backlog and blocked", () => {
  assert.equal(statusAfterMoveToPrio("Backlog"), "Ready");
  assert.equal(statusAfterMoveToPrio("Blocked"), "Started");
  assert.equal(statusAfterMoveToPrio("Started"), "Started");
  assert.equal(statusAfterMoveToPrio("Done"), "Done");
});

test("durationForPlanning uses task estimate up to 120 minutes, else default", () => {
  assert.equal(durationForPlanning(90, 30), 90);
  assert.equal(durationForPlanning(120, 30), 120);
  assert.equal(durationForPlanning(180, 30), 30);
  assert.equal(durationForPlanning(undefined, 45), 45);
});

test("normalizeTasks drops invalid parentId and renumbers sibling order", () => {
  const result = normalizeTasks([
    task({ id: "a", treeOrder: 5 }),
    task({ id: "b", parentId: "missing", treeOrder: 2 }),
    task({ id: "c", parentId: "c", treeOrder: 1 }),
    task({ id: "d", parentId: "a", treeOrder: 9 })
  ]);
  const byId = new Map(result.map((t) => [t.id, t]));
  assert.equal(byId.get("b")!.parentId, undefined, "missing parent cleared");
  assert.equal(byId.get("c")!.parentId, undefined, "self parent cleared");
  assert.equal(byId.get("d")!.parentId, "a", "valid parent kept");
  // d is the only child of a -> treeOrder 0 within its sibling group
  assert.equal(byId.get("d")!.treeOrder, 0);
  // root siblings a, b, c get contiguous treeOrder 0..2 by previous order
  const roots = result.filter((t) => !t.parentId).sort((x, y) => x.treeOrder - y.treeOrder);
  assert.deepEqual(roots.map((t) => t.treeOrder), [0, 1, 2]);
});
