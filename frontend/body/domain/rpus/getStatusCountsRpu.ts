// Query-RPU: Anzahl der Aufgaben je relevantem Status (fuer die Kopfzeile).

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type StatusCounts = { started: number; blocked: number };

export class GetStatusCountsRpu implements Rpu<void, StatusCounts> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): StatusCounts {
    const tasks = this.store.read()?.tasks ?? [];
    return {
      started: tasks.filter((task) => task.status === "Started").length,
      blocked: tasks.filter((task) => task.status === "Blocked").length
    };
  }
}
