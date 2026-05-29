// Command-RPU: legt aus einer freien Buchung eine Aufgabe an und verknuepft
// die Buchung mit ihr.
//
// Die neue Aufgabe wird je nach Modus (Liste / Hierarchie / Board) an der
// Position der Zielaufgabe einsortiert; die uebrigen Aufgaben ruecken nach.
// Die Buchung uebernimmt die neue taskId und verliert ihr freies Label.

import { defaultTaskVisibleIn } from "../constants";
import { uid } from "../id";
import { normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

export type CreateTaskFromBookingRequest = {
  bookingId: string;
  targetTaskId: string;
  mode?: "list" | "hierarchy" | "board";
};

export class CreateTaskFromBookingRpu implements Rpu<CreateTaskFromBookingRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: CreateTaskFromBookingRequest): void {
    const state = this.store.read();
    if (!state) return;

    const mode = request.mode ?? "list";
    const booking = state.bookings.find((candidate) => candidate.id === request.bookingId);
    const targetTask = state.tasks.find((candidate) => candidate.id === request.targetTaskId);
    if (!booking || !targetTask) return;

    const title = (booking.label || "Neue Aufgabe").trim();
    const targetStatus = mode === "board" ? targetTask.status : "Started";
    const task: Task = {
      id: uid("task"),
      title,
      description: booking.description ?? "",
      checklist: [],
      tags: [],
      visibleIn: { ...defaultTaskVisibleIn },
      dueDate: undefined,
      estimateMinutes: undefined,
      parentId: mode === "hierarchy" ? targetTask.parentId : undefined,
      archived: false,
      status: targetStatus,
      done: false,
      treeOrder: mode === "hierarchy" ? targetTask.treeOrder : 0,
      listOrder: mode === "list" ? targetTask.listOrder : 0,
      boardOrder: mode === "board" ? targetTask.boardOrder : 0
    };

    const tasks = state.tasks.map((existingTask) => ({
      ...existingTask,
      treeOrder:
        (existingTask.parentId ?? "") === (task.parentId ?? "") &&
        existingTask.treeOrder >= (mode === "hierarchy" ? targetTask.treeOrder : 0)
          ? existingTask.treeOrder + 1
          : existingTask.treeOrder,
      listOrder:
        existingTask.listOrder >= (mode === "list" ? targetTask.listOrder : 0)
          ? existingTask.listOrder + 1
          : existingTask.listOrder,
      boardOrder:
        existingTask.status === targetStatus && existingTask.boardOrder >= (mode === "board" ? targetTask.boardOrder : 0)
          ? existingTask.boardOrder + 1
          : existingTask.boardOrder
    }));

    this.store.write({
      ...state,
      tasks: normalizeTasks([task, ...tasks]),
      bookings: state.bookings.map((candidate) =>
        candidate.id === request.bookingId ? { ...candidate, taskId: task.id, label: "" } : candidate
      )
    });
  }
}
