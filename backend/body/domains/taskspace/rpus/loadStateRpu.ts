// Query-RPU (Persistenz): laedt den Taskspace-Zustand eines Nutzers.

import type { AppState, StateProvider } from "../providers/stateProvider";
import type { Rpu } from "./rpu";

export type LoadStateRequest = { userId?: number };

export class LoadStateRpu implements Rpu<LoadStateRequest, Promise<AppState>> {
  constructor(private readonly stateProvider: StateProvider) {}

  process(request: LoadStateRequest): Promise<AppState> {
    return this.stateProvider.load(request.userId);
  }
}
