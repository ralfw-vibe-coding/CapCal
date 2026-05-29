// Command-RPU: schreibt einen kompletten Taskspace-Zustand in den Store.
//
// Transitional: nimmt den im Portal berechneten Folgezustand entgegen,
// solange Mutationen noch dort berechnet werden. Wird durch granulare
// Command-RPUs abgeloest, die jeweils eine Aenderung selbst durchfuehren.

import type { TaskspaceStore } from "../taskspaceStore";
import type { AppState } from "../types";
import type { Rpu } from "./rpu";

export type CommitTaskspaceRequest = { state: AppState | null };

export class CommitTaskspaceRpu implements Rpu<CommitTaskspaceRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: CommitTaskspaceRequest): void {
    this.store.write(request.state);
  }
}
