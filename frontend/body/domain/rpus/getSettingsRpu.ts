// Query-RPU: liefert die aktuellen Taskspace-Einstellungen.
//
// Faellt auf die Defaults zurueck, solange kein Taskspace geladen ist.

import { defaultSettings } from "../constants";
import type { TaskspaceStore } from "../taskspaceStore";
import type { AppSettings } from "../types";
import type { Rpu } from "./rpu";

export class GetSettingsRpu implements Rpu<void, AppSettings> {
  constructor(private readonly store: TaskspaceStore) {}

  process(): AppSettings {
    return this.store.read()?.settings ?? defaultSettings;
  }
}
