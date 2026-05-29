// Query-RPU (Kapazitaet): gebuchte Minuten je Aufgabe.
//
// Summiert die Dauer aller Buchungen je Aufgabe und rollt sie entlang der
// Eltern-Kette auf, sodass eine Elternaufgabe die Buchungszeit ihrer
// Unteraufgaben mit ausweist. Reine Domaenenlogik ueber dem Store.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export class GetBookedMinutesByTaskRpu implements Rpu<void, Map<string, number>> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): Map<string, number> {
    const minutes = new Map<string, number>();
    const state = this.store.read();
    if (!state) return minutes;

    const taskById = new Map(state.tasks.map((task) => [task.id, task]));
    for (const booking of state.bookings ?? []) {
      let taskId = booking.taskId;
      const visitedTaskIds = new Set<string>();
      while (taskId && !visitedTaskIds.has(taskId)) {
        const task = taskById.get(taskId);
        if (!task) break;
        visitedTaskIds.add(taskId);
        minutes.set(taskId, (minutes.get(taskId) ?? 0) + booking.durationMinutes);
        taskId = task.parentId;
      }
    }
    return minutes;
  }
}
