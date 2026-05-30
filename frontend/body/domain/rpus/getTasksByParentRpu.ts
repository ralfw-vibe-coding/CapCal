// Query-RPU (Hierarchie): Unteraufgaben je Elternaufgabe, in Baum-Reihenfolge.
//
// Schluessel ist die parentId; Wurzelaufgaben liegen unter dem leeren String.
// Jede Kinderliste ist nach treeOrder sortiert.

import { sortedTasks } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Task } from "../types";
import type { Rpu } from "./rpu";

export class GetTasksByParentRpu implements Rpu<void, Map<string, Task[]>> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): Map<string, Task[]> {
    const children = new Map<string, Task[]>();
    const state = this.store.read();
    if (!state) return children;

    for (const task of state.tasks) {
      const parentKey = task.parentId ?? "";
      children.set(parentKey, [...(children.get(parentKey) ?? []), task]);
    }
    for (const [parentKey, parentTasks] of children.entries()) children.set(parentKey, sortedTasks(parentTasks));
    return children;
  }
}
