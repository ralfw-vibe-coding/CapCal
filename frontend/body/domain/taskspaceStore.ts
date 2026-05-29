// In-Memory-Zustand der Frontend-Domaene: die alleinige Wahrheit ueber den
// Taskspace. Wird beim Laden gefuellt und von den RPUs gelesen/geschrieben.
// Ausserhalb der Domaene kennt niemand diesen Store; das Portal greift nur
// ueber RPUs zu.

import type { AppState } from "./types";

export class TaskspaceStore {
  private state: AppState | null = null;

  read(): AppState | null {
    return this.state;
  }

  write(state: AppState | null): void {
    this.state = state;
  }
}
