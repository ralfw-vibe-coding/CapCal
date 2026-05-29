// Query-RPU: Aufgaben-Index zur schnellen Suche per Id.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

export class GetTaskByIdMapRpu implements Rpu<void, Map<string, Task>> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): Map<string, Task> {
    const state = this.store.read();
    return new Map((state?.tasks ?? []).map((task) => [task.id, task]));
  }
}
