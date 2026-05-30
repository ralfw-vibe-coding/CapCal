// Command-RPU: macht aus einem Checklisteneintrag eine echte Unteraufgabe.
//
// Die neue Aufgabe wird Kind der Aufgabe, in deren Checkliste der Eintrag stand,
// als erstes Kind einsortiert, Status "Backlog". Der Checklisteneintrag wird
// dabei aus der Checkliste entfernt. No-op bei fehlender Aufgabe/fehlendem
// Eintrag oder leerem Text.

import { defaultTaskVisibleIn } from "../constants";
import { uid } from "../id";
import { normalizeTasks } from "../tasks";
import type { Task } from "../types";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type ConvertChecklistItemToTaskRequest = { parentTaskId: string; checklistItemId: string };

export class ConvertChecklistItemToTaskRpu implements Rpu<ConvertChecklistItemToTaskRequest, Task | null> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: ConvertChecklistItemToTaskRequest): Task | null {
    const state = this.store.read();
    if (!state) return null;

    const parent = state.tasks.find((task) => task.id === request.parentTaskId);
    if (!parent) return null;
    const item = (parent.checklist ?? []).find((entry) => entry.id === request.checklistItemId);
    if (!item) return null;
    const title = item.text.trim();
    if (!title) return null;

    const child: Task = {
      id: uid("task"),
      title,
      description: "",
      checklist: [],
      tags: [],
      visibleIn: { ...defaultTaskVisibleIn },
      parentId: parent.id,
      archived: false,
      status: "Backlog",
      done: false,
      treeOrder: 0,
      listOrder: 0,
      boardOrder: 0
    };

    const siblingKey = parent.id;
    const tasks = normalizeTasks([
      child,
      ...state.tasks.map((task) => {
        const withoutItem =
          task.id === parent.id
            ? { ...task, checklist: (task.checklist ?? []).filter((entry) => entry.id !== request.checklistItemId) }
            : task;
        return {
          ...withoutItem,
          treeOrder: (withoutItem.parentId ?? "") === siblingKey ? withoutItem.treeOrder + 1 : withoutItem.treeOrder,
          listOrder: withoutItem.listOrder + 1,
          boardOrder: withoutItem.status === child.status ? withoutItem.boardOrder + 1 : withoutItem.boardOrder
        };
      })
    ]);

    this.store.write({ ...state, tasks });
    return child;
  }
}
