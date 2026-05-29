// Query-RPU (Prio-Ansicht): die priorisierten Aufgaben in ihrer Reihenfolge,
// jeweils mit der geplanten Dauer.
//
// Archivierte oder nicht mehr existierende Aufgaben werden ausgelassen. Die
// Dauer stammt aus prioDurations oder faellt auf die Planungsdauer der
// Aufgabe zurueck.

import { durationForPlanning } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

export type PrioListEntry = { task: Task; durationMinutes: number };

export class GetPrioListRpu implements Rpu<void, PrioListEntry[]> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): PrioListEntry[] {
    const state = this.store.read();
    if (!state) return [];

    const taskById = new Map(state.tasks.map((task) => [task.id, task]));
    const defaultPrioDurationMinutes = state.settings?.defaultPrioDurationMinutes ?? 30;
    const entries: PrioListEntry[] = [];

    for (const taskId of state.prioTaskIds) {
      const task = taskById.get(taskId);
      if (!task || task.archived) continue;
      const durationMinutes =
        state.prioDurations?.[task.id] ?? durationForPlanning(task.estimateMinutes, defaultPrioDurationMinutes);
      entries.push({ task, durationMinutes });
    }

    return entries;
  }
}
