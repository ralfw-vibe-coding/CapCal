// Command-RPU (Persistenz): speichert den Taskspace-Zustand eines Nutzers und
// liefert den gespeicherten Zustand zurueck.

import type { AppState, StateProvider } from "../providers/stateProvider";
import type { Rpu } from "./rpu";

export type SaveStateRequest = { state: AppState; userId?: number };

export class SaveStateRpu implements Rpu<SaveStateRequest, Promise<AppState>> {
  constructor(private readonly stateProvider: StateProvider) {}

  async process(request: SaveStateRequest): Promise<AppState> {
    await this.stateProvider.save(request.state, request.userId);
    return request.state;
  }
}
