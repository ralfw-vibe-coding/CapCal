// Command-RPU: verschiebt eine Aufgabe im Board in eine Statusspalte und an
// die gewuenschte Position.
//
// Setzt den Status (und done) der Aufgabe, ordnet sie innerhalb der Zielspalte
// vor die Zielaufgabe (oder ans Ende) und nummeriert die boardOrder neu.
// Archivierte Aufgaben werden nicht verschoben.

import { moveItemToDropTarget, normalizeTasks, sortedBoardTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { TaskStatus } from "../types";
import type { Rpu } from "./rpu";

export type MoveTaskToBoardStatusRequest = { taskId: string; status: TaskStatus; targetTaskId?: string };

export class MoveTaskToBoardStatusRpu implements Rpu<MoveTaskToBoardStatusRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: MoveTaskToBoardStatusRequest): void {
    const state = this.store.read();
    if (!state) return;
    if (state.tasks.find((task) => task.id === request.taskId)?.archived) return;

    const { taskId, status, targetTaskId } = request;
    const done = status === "Done" || status === "Aborted";
    const statusTasks = sortedBoardTasks(
      state.tasks
        .map((task) => (task.id === taskId ? { ...task, status, done } : task))
        .filter((task) => task.status === status)
    );
    const orderedIds = statusTasks.map((task) => task.id);
    if (!orderedIds.includes(taskId)) orderedIds.push(taskId);
    const sourceIndex = orderedIds.indexOf(taskId);
    const targetIndex = targetTaskId ? orderedIds.indexOf(targetTaskId) : orderedIds.length - 1;
    const nextIds = targetIndex >= 0 ? moveItemToDropTarget(orderedIds, sourceIndex, targetIndex) : orderedIds;

    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((task) => {
          if (task.id === taskId) return { ...task, status, done, boardOrder: nextIds.indexOf(task.id) };
          if (nextIds.includes(task.id)) return { ...task, boardOrder: nextIds.indexOf(task.id) };
          return task;
        })
      )
    });
  }
}
