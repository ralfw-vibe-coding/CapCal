// Query-RPU: alle gespeicherten Tagesvorlagen.

import type { TaskspaceStore } from "../taskspaceStore";
import type { DayTemplate } from "../types";
import type { Rpu } from "./rpu";

export class GetDayTemplatesRpu implements Rpu<void, DayTemplate[]> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): DayTemplate[] {
    return this.store.read()?.dayTemplates ?? [];
  }
}
