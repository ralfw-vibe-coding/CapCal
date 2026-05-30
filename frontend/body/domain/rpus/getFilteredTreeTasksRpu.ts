// Query-RPU (Tree-Ansicht): die gefilterte, sortierte Aufgabenliste fuer die
// aktuelle Sicht (Liste, Board oder Hierarchie).
//
// Wendet die Tree-Filter (Suchtext, Status, Tags, Archiv) sowie die
// Sichtbarkeitsregeln der aktuellen Sicht an. In der Hierarchie bleiben
// Aufgaben mit Eltern- oder Kindbeziehung sichtbar, unabhaengig vom
// visibleIn-Flag.

import { normalizeTaskVisibleIn, sortedListTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

export class GetFilteredTreeTasksRpu implements Rpu<void, Task[]> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): Task[] {
    const state = this.store.read();
    if (!state) return [];

    const settings = state.settings;
    const treeFilters = settings?.treeFilters ?? { query: "", statuses: [], tags: [], showArchived: false };
    const taskView = settings?.taskView ?? "list";
    const query = treeFilters.query.trim().toLowerCase();

    const childCountByTaskId = new Map<string, number>();
    for (const task of state.tasks) {
      if (task.parentId) childCountByTaskId.set(task.parentId, (childCountByTaskId.get(task.parentId) ?? 0) + 1);
    }

    return sortedListTasks(state.tasks).filter((task) => {
      const visibleIn = normalizeTaskVisibleIn(task.visibleIn);
      const hierarchyLockedVisible = Boolean(task.parentId) || (childCountByTaskId.get(task.id) ?? 0) > 0;
      const matchesView =
        taskView === "list"
          ? visibleIn.list
          : taskView === "board"
            ? visibleIn.board
            : hierarchyLockedVisible || visibleIn.hierarchy;
      const matchesArchive = treeFilters.showArchived ? task.archived : !task.archived;
      const matchesQuery = !query || task.title.toLowerCase().includes(query);
      const matchesStatus = treeFilters.statuses.length === 0 || treeFilters.statuses.includes(task.status);
      const taskTags = task.tags ?? [];
      const matchesTags = treeFilters.tags.length === 0 || treeFilters.tags.every((tag) => taskTags.includes(tag));
      return matchesView && matchesArchive && matchesQuery && matchesStatus && matchesTags;
    });
  }
}
