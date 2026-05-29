// Command-RPU: speichert den uebergebenen Taskspace-Zustand.
// Wirft bei Fehlschlag; das Portal entscheidet ueber Zeitpunkt und Fehleranzeige.

import type { TaskspaceStateProvider } from "../providers/taskspaceStateProvider";
import type { AppState } from "../types";
import type { Rpu } from "./rpu";

export type SaveTaskspaceRequest = {
  state: AppState;
  keepalive?: boolean;
};

export class SaveTaskspaceRpu implements Rpu<SaveTaskspaceRequest, Promise<void>> {
  constructor(private readonly stateProvider: TaskspaceStateProvider) {}

  async process(request: SaveTaskspaceRequest): Promise<void> {
    await this.stateProvider.save(request.state, { keepalive: request.keepalive });
  }
}
