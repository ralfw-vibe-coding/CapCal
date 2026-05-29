// Command-RPU: verschiebt eine Aufgabe in der Listenansicht vor eine andere.
//
// Archivierte Aufgaben werden nicht verschoben (no-op). Die listOrder wird
// nach dem Verschieben neu durchnummeriert.

import { moveItemToDropTarget, sortedListTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type MoveTaskInListRequest = { sourceTaskId: string; targetTaskId: string };

export class MoveTaskInListRpu implements Rpu<MoveTaskInListRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: MoveTaskInListRequest): void {
    const state = this.store.read();
    if (!state) return;
    if (state.tasks.find((task) => task.id === request.sourceTaskId)?.archived) return;

    const tasks = sortedListTasks(state.tasks);
    const sourceIndex = tasks.findIndex((task) => task.id === request.sourceTaskId);
    const targetIndex = tasks.findIndex((task) => task.id === request.targetTaskId);
    this.store.write({
      ...state,
      tasks: moveItemToDropTarget(tasks, sourceIndex, targetIndex).map((task, listOrder) => ({ ...task, listOrder }))
    });
  }
}
