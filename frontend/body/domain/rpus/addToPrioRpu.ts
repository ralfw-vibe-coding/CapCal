// Command-RPU: nimmt eine Aufgabe in die Priorisierung auf.
//
// No-op, wenn die Aufgabe bereits priorisiert, nicht vorhanden oder archiviert
// ist. Beim Aufnehmen rueckt der Status ggf. vor (Backlog -> Ready usw.) und
// es wird eine Planungsdauer hinterlegt.

import { defaultSettings } from "../constants";
import { durationForPlanning, normalizeTasks, statusAfterMoveToPrio } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type AddToPrioRequest = { taskId: string };

export class AddToPrioRpu implements Rpu<AddToPrioRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: AddToPrioRequest): void {
    const state = this.store.read();
    if (!state) return;
    if (state.prioTaskIds.includes(request.taskId)) return;
    const task = state.tasks.find((candidate) => candidate.id === request.taskId);
    if (!task || task.archived) return;

    const defaultPrioDurationMinutes = (state.settings ?? defaultSettings).defaultPrioDurationMinutes;
    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((candidate) => {
          if (candidate.id !== request.taskId) return candidate;
          const status = statusAfterMoveToPrio(candidate.status);
          return { ...candidate, status, done: status === "Done" || status === "Aborted" };
        })
      ),
      prioTaskIds: [...state.prioTaskIds, request.taskId],
      prioDurations: {
        ...(state.prioDurations ?? {}),
        [request.taskId]: durationForPlanning(task.estimateMinutes, defaultPrioDurationMinutes)
      }
    });
  }
}
