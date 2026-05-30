// Query-RPU: geteilte Anzeige-Metriken je Aufgabe.
//
// Liefert pro Aufgabe die Anzahl Buchungen, die Anzahl (aktiver) Unteraufgaben
// und den Titel der Elternaufgabe. Diese Werte werden in Listen-, Board- und
// Hierarchie-Ansicht gleichermassen auf den Karten angezeigt.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type TaskMetrics = {
  bookingCountByTaskId: Map<string, number>;
  childCountByTaskId: Map<string, number>;
  activeChildCountByTaskId: Map<string, number>;
  parentTitleByTaskId: Map<string, string>;
};

export class GetTaskMetricsRpu implements Rpu<void, TaskMetrics> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): TaskMetrics {
    const bookingCountByTaskId = new Map<string, number>();
    const childCountByTaskId = new Map<string, number>();
    const activeChildCountByTaskId = new Map<string, number>();
    const parentTitleByTaskId = new Map<string, string>();

    const state = this.store.read();
    if (!state) {
      return { bookingCountByTaskId, childCountByTaskId, activeChildCountByTaskId, parentTitleByTaskId };
    }

    const taskById = new Map(state.tasks.map((task) => [task.id, task]));

    for (const booking of state.bookings ?? []) {
      if (booking.taskId) bookingCountByTaskId.set(booking.taskId, (bookingCountByTaskId.get(booking.taskId) ?? 0) + 1);
    }

    for (const task of state.tasks) {
      if (!task.parentId) continue;
      childCountByTaskId.set(task.parentId, (childCountByTaskId.get(task.parentId) ?? 0) + 1);
      if (!task.archived) {
        activeChildCountByTaskId.set(task.parentId, (activeChildCountByTaskId.get(task.parentId) ?? 0) + 1);
      }
      parentTitleByTaskId.set(task.id, taskById.get(task.parentId)?.title ?? "");
    }

    return { bookingCountByTaskId, childCountByTaskId, activeChildCountByTaskId, parentTitleByTaskId };
  }
}
