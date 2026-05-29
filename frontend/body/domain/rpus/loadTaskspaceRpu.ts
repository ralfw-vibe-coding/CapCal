// Query-RPU: laedt den Taskspace und liefert ihn normalisiert zurueck.

import type { TaskspaceStateProvider } from "../providers/taskspaceStateProvider";
import { normalizeState } from "../state";
import type { AppState } from "../types";
import type { Rpu } from "./rpu";

export type LoadTaskspaceResponse =
  | { kind: "ok"; state: AppState }
  | { kind: "unauthorized" };

export class LoadTaskspaceRpu implements Rpu<void, Promise<LoadTaskspaceResponse>> {
  constructor(private readonly stateProvider: TaskspaceStateProvider) {}

  async process(): Promise<LoadTaskspaceResponse> {
    const result = await this.stateProvider.load();
    if (result.kind === "unauthorized") return { kind: "unauthorized" };
    return { kind: "ok", state: normalizeState(result.rawState) };
  }
}
