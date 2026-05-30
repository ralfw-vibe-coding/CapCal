// Query-RPU (Board-Ansicht): die anzuzeigenden Statusspalten in fester
// Reihenfolge, ohne die in den Einstellungen ausgeblendeten Status.

import { statuses } from "../constants";
import type { TaskspaceStore } from "../taskspaceStore";
import type { TaskStatus } from "../types";
import type { Rpu } from "./rpu";

export class GetVisibleBoardStatusesRpu implements Rpu<void, TaskStatus[]> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): TaskStatus[] {
    const hidden = this.store.read()?.settings?.boardHiddenStatuses ?? [];
    return statuses.filter((status) => !hidden.includes(status));
  }
}
