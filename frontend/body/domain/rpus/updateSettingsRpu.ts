// Command-RPU: aktualisiert die Taskspace-Einstellungen.
//
// Wendet einen Teil-Patch auf die Settings an und normalisiert dabei
// treeFilters, boardHiddenStatuses und panelsCollapsed, damit keine
// inkonsistenten Werte entstehen.

import { defaultSettings } from "../constants";
import { normalizeTaskStatuses, normalizeTreeFilters } from "../tasks";
import type { TaskspaceStore } from "../taskspaceStore";
import type { AppSettings } from "../types";
import type { Rpu } from "./rpu";

export type UpdateSettingsRequest = { patch: Partial<AppSettings> };

export class UpdateSettingsRpu implements Rpu<UpdateSettingsRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: UpdateSettingsRequest): void {
    const state = this.store.read();
    if (!state) return;
    const { patch } = request;

    this.store.write({
      ...state,
      settings: {
        ...defaultSettings,
        ...(state.settings ?? defaultSettings),
        ...patch,
        treeFilters: normalizeTreeFilters({
          ...(state.settings?.treeFilters ?? defaultSettings.treeFilters),
          ...(patch.treeFilters ?? {})
        }),
        boardHiddenStatuses: normalizeTaskStatuses(patch.boardHiddenStatuses ?? state.settings?.boardHiddenStatuses),
        panelsCollapsed: {
          ...defaultSettings.panelsCollapsed,
          ...(state.settings?.panelsCollapsed ?? defaultSettings.panelsCollapsed),
          ...(patch.panelsCollapsed ?? {})
        }
      }
    });
  }
}
