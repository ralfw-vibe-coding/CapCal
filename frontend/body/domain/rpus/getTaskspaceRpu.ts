// Query-RPU: liefert den aktuellen Taskspace-Zustand aus dem Store.
//
// Transitional: dient dem Portal als Lesequelle, solange Mutationen noch
// ueber updateState im Portal berechnet werden. Wird durch granulare
// Query-RPUs abgeloest.

import type { TaskspaceStore } from "../taskspaceStore";
import type { AppState } from "../types";
import type { Rpu } from "./rpu";

export class GetTaskspaceRpu implements Rpu<void, AppState | null> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): AppState | null {
    return this.store.read();
  }
}
