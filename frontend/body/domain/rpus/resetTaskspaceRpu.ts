// Command-RPU: leert den Taskspace-Zustand (z.B. beim Logout).
//
// Setzt den Store zurueck, sodass kein Domaenenzustand des abgemeldeten Users
// im Speicher verbleibt.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export class ResetTaskspaceRpu implements Rpu<void, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): void {
    this.store.write(null);
  }
}
