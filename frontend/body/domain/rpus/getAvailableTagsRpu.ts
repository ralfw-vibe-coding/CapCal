// Query-RPU: alle in Aufgaben vergebenen Tags, dedupliziert und alphabetisch
// (deutsche Sortierung). Speist die Tag-Filter und -Auswahl.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export class GetAvailableTagsRpu implements Rpu<void, string[]> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): string[] {
    const state = this.store.read();
    if (!state) return [];
    return Array.from(new Set(state.tasks.flatMap((task) => task.tags ?? []))).sort((a, b) => a.localeCompare(b, "de"));
  }
}
