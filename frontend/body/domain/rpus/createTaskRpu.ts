// Command-RPU: legt eine neue Aufgabe an.
//
// Liest die Default-Werte aus den Settings, fuegt die Aufgabe als erste unter
// ihren Geschwistern ein und ordnet die Reihenfolgen neu. Optional wird die
// Aufgabe direkt priorisiert (target "prio") oder fuer einen Tag gebucht
// (target "cal"). Liefert die angelegte Aufgabe zurueck oder null bei leerem
// Titel / fehlendem Zustand.

import { defaultSettings, defaultTaskVisibleIn, today } from "../constants";
import { uid } from "../id";
import { durationForPlanning, normalizeTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { AppState, Task, TaskStatus } from "../types";
import type { Rpu } from "./rpu";

export type CreateTaskRequest = {
  title: string;
  target?: "prio" | "cal";
  date?: string;
  initialStatus?: TaskStatus;
  parentId?: string;
};

export class CreateTaskRpu implements Rpu<CreateTaskRequest, Task | null> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: CreateTaskRequest): Task | null {
    const state = this.store.read();
    if (!state) return null;

    const trimmed = request.title.trim();
    if (!trimmed) return null;

    const settings = state.settings ?? defaultSettings;
    const date = request.date ?? today;
    const target = request.target;
    const parentId = request.parentId;
    const estimateMinutes = settings.defaultTreeDurationMinutes;
    const planningDurationMinutes = durationForPlanning(estimateMinutes, settings.defaultPrioDurationMinutes);
    const status = request.initialStatus ?? (target === "cal" ? "Started" : settings.defaultTaskStatus);

    const task: Task = {
      id: uid("task"),
      title: trimmed,
      description: "",
      checklist: [],
      tags: [],
      visibleIn: { ...defaultTaskVisibleIn },
      dueDate: target === "cal" ? date : undefined,
      estimateMinutes,
      parentId,
      archived: false,
      status,
      done: status === "Done" || status === "Aborted",
      treeOrder: 0,
      listOrder: 0,
      boardOrder: 0
    };

    const siblingKey = parentId ?? "";
    const statusKey = task.status;
    const tasks = normalizeTasks([
      { ...task, treeOrder: 0, listOrder: 0, boardOrder: 0 },
      ...state.tasks.map((existingTask) => ({
        ...existingTask,
        treeOrder: (existingTask.parentId ?? "") === siblingKey ? existingTask.treeOrder + 1 : existingTask.treeOrder,
        listOrder: existingTask.listOrder + 1,
        boardOrder: existingTask.status === statusKey ? existingTask.boardOrder + 1 : existingTask.boardOrder
      }))
    ]);

    const next: AppState = {
      ...state,
      tasks,
      prioTaskIds: [...state.prioTaskIds],
      prioDurations: { ...(state.prioDurations ?? {}) },
      bookings: [...state.bookings]
    };
    if (target === "prio") {
      next.prioTaskIds.push(task.id);
      next.prioDurations = { ...(next.prioDurations ?? {}), [task.id]: planningDurationMinutes };
    }
    if (target === "cal") {
      next.bookings.push({ id: uid("booking"), taskId: task.id, date, durationMinutes: planningDurationMinutes });
    }

    this.store.write(next);
    return task;
  }
}
