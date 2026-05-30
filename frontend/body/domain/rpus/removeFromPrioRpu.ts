// Command-RPU: entfernt eine Aufgabe aus der Priorisierung.
//
// Loescht den Eintrag aus der Reihenfolge und die hinterlegte Planungsdauer.
// Die Aufgabe selbst bleibt unveraendert im Tree.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type RemoveFromPrioRequest = { taskId: string };

export class RemoveFromPrioRpu implements Rpu<RemoveFromPrioRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: RemoveFromPrioRequest): void {
    const state = this.store.read();
    if (!state) return;
    const { [request.taskId]: _removed, ...prioDurations } = state.prioDurations ?? {};
    this.store.write({
      ...state,
      prioTaskIds: state.prioTaskIds.filter((id) => id !== request.taskId),
      prioDurations
    });
  }
}
