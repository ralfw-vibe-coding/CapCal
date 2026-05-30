// Command-RPU: aktualisiert die Felder einer Aufgabe.
//
// Wendet den Patch auf die betroffene Aufgabe an und normalisiert anschliessend
// den Aufgabenbestand (Reihenfolgen, Checkliste, Tags usw.).

import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

export type UpdateTaskRequest = { taskId: string; patch: Partial<Task> };

export class UpdateTaskRpu implements Rpu<UpdateTaskRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: UpdateTaskRequest): void {
    const state = this.store.read();
    if (!state) return;
    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((task) => (task.id === request.taskId ? { ...task, ...request.patch } : task))
      )
    });
  }
}
