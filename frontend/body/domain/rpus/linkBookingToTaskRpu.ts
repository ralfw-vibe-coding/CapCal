// Command-RPU: verknuepft eine freie Buchung mit einer Aufgabe.
//
// Die Aufgabe wechselt auf "Started" (sofern nicht "Done"); die Buchung
// erhaelt die taskId und verliert ihr freies Label.

import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type LinkBookingToTaskRequest = { bookingId: string; taskId: string };

export class LinkBookingToTaskRpu implements Rpu<LinkBookingToTaskRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: LinkBookingToTaskRequest): void {
    const state = this.store.read();
    if (!state) return;
    this.store.write({
      ...state,
      tasks: normalizeTasks(
        state.tasks.map((task) =>
          task.id === request.taskId && task.status !== "Done" ? { ...task, status: "Started" } : task
        )
      ),
      bookings: state.bookings.map((booking) =>
        booking.id === request.bookingId ? { ...booking, taskId: request.taskId, label: "" } : booking
      )
    });
  }
}
