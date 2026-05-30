// Command-RPU: macht eine Aufgabe zur Unteraufgabe einer anderen.
//
// Verhindert Zyklen: eine Aufgabe kann nicht unter sich selbst oder unter
// einen ihrer Nachfahren gehaengt werden. Archivierte Aufgaben werden nicht
// verschoben. Die Aufgabe wird ans Ende der Geschwister einsortiert.

import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

function isDescendant(tasks: Task[], taskId: string, possibleAncestorId: string): boolean {
  let current = tasks.find((task) => task.id === taskId);
  while (current?.parentId) {
    if (current.parentId === possibleAncestorId) return true;
    current = tasks.find((task) => task.id === current?.parentId);
  }
  return false;
}

export type MoveTaskAsChildRequest = { sourceTaskId: string; parentId: string };

export class MoveTaskAsChildRpu implements Rpu<MoveTaskAsChildRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: MoveTaskAsChildRequest): void {
    const state = this.store.read();
    if (!state) return;
    if (state.tasks.find((task) => task.id === request.sourceTaskId)?.archived) return;
    if (request.sourceTaskId === request.parentId || isDescendant(state.tasks, request.parentId, request.sourceTaskId)) {
      return;
    }

    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((task) =>
          task.id === request.sourceTaskId
            ? { ...task, parentId: request.parentId, treeOrder: Number.MAX_SAFE_INTEGER }
            : task
        )
      )
    });
  }
}
