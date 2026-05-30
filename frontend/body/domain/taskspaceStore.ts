// In-Memory-Zustand der Frontend-Domaene: die alleinige Wahrheit ueber den
// Taskspace. Wird beim Laden gefuellt und von den RPUs gelesen/geschrieben.
// Ausserhalb der Domaene kennt niemand diesen Store; das Portal greift nur
// ueber RPUs zu.

import type { AppState } from "./types";

export class TaskspaceStore {
  private state: AppState | null = null;
  private rev = 0;

  read(): AppState | null {
    return this.state;
  }

  write(state: AppState | null): void {
    this.state = state;
    this.rev += 1;
  }

  // Monotone Revision: erhoeht sich bei jedem Schreibvorgang. Dient dem Portal
  // als Render-Trigger und der Dirty-Erkennung, ohne den State offenzulegen.
  revision(): number {
    return this.rev;
  }
}
