// Command-RPU: archiviert eine Aufgabe oder hebt die Archivierung auf.
//
// Eine Aufgabe mit aktiven (nicht archivierten) Unteraufgaben kann nicht
// archiviert werden (no-op). Beim Archivieren wird die Aufgabe aus der Prio
// entfernt und ein Archivierungszeitpunkt gesetzt.

import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type ToggleTaskArchivedRequest = { taskId: string };

export class ToggleTaskArchivedRpu implements Rpu<ToggleTaskArchivedRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: ToggleTaskArchivedRequest): void {
    const state = this.store.read();
    if (!state) return;

    const task = state.tasks.find((candidate) => candidate.id === request.taskId);
    if (!task) return;
    const hasActiveChildren = state.tasks.some(
      (candidate) => candidate.parentId === request.taskId && !candidate.archived
    );
    if (!task.archived && hasActiveChildren) return;

    const { [request.taskId]: _removed, ...prioDurations } = state.prioDurations ?? {};
    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((candidate) =>
          candidate.id === request.taskId
            ? {
                ...candidate,
                archived: !candidate.archived,
                archivedAt: candidate.archived ? undefined : new Date().toISOString()
              }
            : candidate
        )
      ),
      prioTaskIds: state.prioTaskIds.filter((id) => id !== request.taskId),
      prioDurations
    });
  }
}
