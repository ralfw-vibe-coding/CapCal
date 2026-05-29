// Command-RPU: speichert den aktuellen Taskspace-Zustand aus dem Store.
//
// Liest den State selbst aus dem Store (kein State-Parameter von aussen) und
// uebergibt ihn dem Domain State Provider. Wirft bei Fehlschlag; das Portal
// entscheidet ueber Zeitpunkt und Fehleranzeige.

import type { TaskspaceStateProvider } from "../providers/taskspaceStateProvider";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type SaveTaskspaceRequest = { keepalive?: boolean };

export class SaveTaskspaceRpu implements Rpu<SaveTaskspaceRequest, Promise<void>> {
  constructor(
    private readonly stateProvider: TaskspaceStateProvider,
    private readonly store: TaskspaceStore
  ) {}

  async process(request: SaveTaskspaceRequest): Promise<void> {
    const state = this.store.read();
    if (!state) return;
    await this.stateProvider.save(state, { keepalive: request.keepalive });
  }
}
