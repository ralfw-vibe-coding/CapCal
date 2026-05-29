// Command-RPU: bucht eine Aufgabe auf einen Tag (optional mit Startzeit).
//
// Die Aufgabe wird aus der Prio entfernt, ihr Status wird auf "Started"
// gesetzt (sofern nicht bereits "Done"), und eine Buchung wird angelegt. Die
// Dauer stammt bei Quelle "prio" aus der Planungsdauer, sonst aus der
// Planungsdauer der Aufgabe.

import { defaultSettings } from "../constants";
import { uid } from "../id";
import { durationForPlanning, normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type BookTaskRequest = {
  taskId: string;
  date: string;
  startTime?: string;
  source?: "tree" | "prio";
};

export class BookTaskRpu implements Rpu<BookTaskRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: BookTaskRequest): void {
    const state = this.store.read();
    if (!state) return;

    const task = state.tasks.find((candidate) => candidate.id === request.taskId);
    if (!task || task.archived) return;

    const defaultPrioDurationMinutes = (state.settings ?? defaultSettings).defaultPrioDurationMinutes;
    const durationMinutes =
      request.source === "prio"
        ? (state.prioDurations?.[request.taskId] ?? durationForPlanning(task.estimateMinutes, defaultPrioDurationMinutes))
        : durationForPlanning(task.estimateMinutes, defaultPrioDurationMinutes);
    const { [request.taskId]: _removed, ...prioDurations } = state.prioDurations ?? {};

    this.store.write({
      ...state,
      prioTaskIds: state.prioTaskIds.filter((id) => id !== request.taskId),
      prioDurations,
      tasks: normalizeTasks(
        state.tasks.map((candidate) =>
          candidate.id === request.taskId && candidate.status !== "Done" ? { ...candidate, status: "Started" } : candidate
        )
      ),
      bookings: [
        ...state.bookings,
        { id: uid("booking"), taskId: request.taskId, date: request.date, startTime: request.startTime, durationMinutes }
      ]
    });
  }
}
