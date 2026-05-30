// Command-RPU: loescht eine Aufgabe samt ihrer Spuren in Prio und Buchungen.
//
// Eine Aufgabe mit Unteraufgaben wird nicht geloescht (no-op), damit keine
// verwaisten Kinder entstehen.

import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type DeleteTaskRequest = { taskId: string };

export class DeleteTaskRpu implements Rpu<DeleteTaskRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: DeleteTaskRequest): void {
    const state = this.store.read();
    if (!state) return;
    if (state.tasks.some((task) => task.parentId === request.taskId)) return;

    this.store.write({
      ...state,
      tasks: normalizeTasks(state.tasks.filter((task) => task.id !== request.taskId)),
      prioTaskIds: state.prioTaskIds.filter((id) => id !== request.taskId),
      prioDurations: Object.fromEntries(
        Object.entries(state.prioDurations ?? {}).filter(([id]) => id !== request.taskId)
      ),
      bookings: state.bookings.filter((booking) => booking.taskId !== request.taskId)
    });
  }
}
