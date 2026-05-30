// Command-RPU: verschiebt eine Aufgabe in der Prio-Liste vor eine andere.
//
// War die Aufgabe noch nicht priorisiert, wird sie dabei aufgenommen (Status
// rueckt ggf. vor, Planungsdauer wird gesetzt). Archivierte oder nicht
// vorhandene Aufgaben werden nicht verschoben.

import { defaultSettings } from "../constants";
import { durationForPlanning, moveItemToDropTarget, normalizeTasks, statusAfterMoveToPrio } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type MoveInPrioRequest = { sourceTaskId: string; targetTaskId: string };

export class MoveInPrioRpu implements Rpu<MoveInPrioRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: MoveInPrioRequest): void {
    const state = this.store.read();
    if (!state) return;

    const sourceWasNew = !state.prioTaskIds.includes(request.sourceTaskId);
    const sourceTask = state.tasks.find((task) => task.id === request.sourceTaskId);
    if (!sourceTask || sourceTask.archived) return;

    const defaultPrioDurationMinutes = (state.settings ?? defaultSettings).defaultPrioDurationMinutes;
    const prioTaskIds = state.prioTaskIds.includes(request.sourceTaskId)
      ? [...state.prioTaskIds]
      : [...state.prioTaskIds, request.sourceTaskId];
    const sourceIndex = prioTaskIds.indexOf(request.sourceTaskId);
    const targetIndex = prioTaskIds.indexOf(request.targetTaskId);

    this.store.write({
      ...state,
      tasks: sourceWasNew
        ? normalizeTasks(
            state.tasks.map((task) => {
              if (task.id !== request.sourceTaskId) return task;
              const status = statusAfterMoveToPrio(task.status);
              return { ...task, status, done: status === "Done" || status === "Aborted" };
            })
          )
        : state.tasks,
      prioDurations: sourceWasNew
        ? {
            ...(state.prioDurations ?? {}),
            [request.sourceTaskId]: durationForPlanning(sourceTask.estimateMinutes, defaultPrioDurationMinutes)
          }
        : state.prioDurations,
      prioTaskIds: moveItemToDropTarget(prioTaskIds, sourceIndex, targetIndex)
    });
  }
}
