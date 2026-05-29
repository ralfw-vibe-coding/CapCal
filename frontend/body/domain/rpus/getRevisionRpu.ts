// Query-RPU: aktuelle Store-Revision.
//
// Das Portal nutzt sie als Render-Trigger (Pull nach Commands) und zur
// Dirty-Erkennung beim Speichern, ohne den Domaenenzustand selbst zu sehen.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export class GetRevisionRpu implements Rpu<void, number> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): number {
    return this.store.revision();
  }
}
