// Command-RPU: setzt die geplante Dauer einer priorisierten Aufgabe.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type SetPrioDurationRequest = { taskId: string; durationMinutes: number };

export class SetPrioDurationRpu implements Rpu<SetPrioDurationRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: SetPrioDurationRequest): void {
    const state = this.store.read();
    if (!state) return;
    this.store.write({
      ...state,
      prioDurations: { ...(state.prioDurations ?? {}), [request.taskId]: request.durationMinutes }
    });
  }
}
