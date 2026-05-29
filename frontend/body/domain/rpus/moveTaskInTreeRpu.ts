// Command-RPU: verschiebt eine Aufgabe in der Hierarchie vor eine andere.
//
// Die Aufgabe uebernimmt das Elternteil der Zielaufgabe und wird unter den
// Geschwistern direkt vor die Zielaufgabe einsortiert. Archivierte Aufgaben
// werden nicht verschoben.

import { normalizeTasks, sortedTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type MoveTaskInTreeRequest = { sourceTaskId: string; targetTaskId: string };

export class MoveTaskInTreeRpu implements Rpu<MoveTaskInTreeRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: MoveTaskInTreeRequest): void {
    const state = this.store.read();
    if (!state) return;

    const sourceTask = state.tasks.find((task) => task.id === request.sourceTaskId);
    const targetTask = state.tasks.find((task) => task.id === request.targetTaskId);
    if (sourceTask?.archived) return;
    if (!sourceTask || !targetTask || sourceTask.id === targetTask.id) return;

    const parentId = targetTask.parentId;
    const movedTasks = state.tasks.map((task) => (task.id === request.sourceTaskId ? { ...task, parentId } : task));
    const siblings = sortedTasks(
      movedTasks.filter((task) => (task.parentId ?? "") === (parentId ?? "") && task.id !== request.sourceTaskId)
    );
    const targetIndex = siblings.findIndex((task) => task.id === request.targetTaskId);
    const orderedSiblingIds = [
      ...siblings.slice(0, targetIndex).map((task) => task.id),
      request.sourceTaskId,
      ...siblings.slice(targetIndex).map((task) => task.id)
    ];

    this.store.write({
      ...state,
      tasks: normalizeTasks(
        movedTasks.map((task) =>
          orderedSiblingIds.includes(task.id) ? { ...task, treeOrder: orderedSiblingIds.indexOf(task.id) } : task
        )
      )
    });
  }
}
