// Command-RPU: loest eine Aufgabe aus ihrer Eltern-Beziehung.
//
// Die Aufgabe wird zur Wurzelaufgabe und hinter die bestehenden Wurzelaufgaben
// einsortiert.

import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type DetachTaskFromParentRequest = { taskId: string };

export class DetachTaskFromParentRpu implements Rpu<DetachTaskFromParentRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: DetachTaskFromParentRequest): void {
    const state = this.store.read();
    if (!state) return;

    const maxRootTreeOrder = Math.max(-1, ...state.tasks.filter((task) => !task.parentId).map((task) => task.treeOrder));
    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((task) =>
          task.id === request.taskId ? { ...task, parentId: undefined, treeOrder: maxRootTreeOrder + 1 } : task
        )
      )
    });
  }
}
