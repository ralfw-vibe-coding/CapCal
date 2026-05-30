// Command-RPU: importiert einen Taskspace aus rohem JSON-Text.
// Parst und normalisiert; das Speichern uebernimmt anschliessend das Portal
// (ueber den ueblichen Save-Pfad).

import { normalizeState } from "../state";
import type { TaskspaceStore } from "../taskspaceStore";
import type { AppState } from "../types";
import type { Rpu } from "./rpu";

export type ImportTaskspaceRequest = { json: string };

export type ImportTaskspaceResponse =
  | { kind: "ok"; state: AppState }
  | { kind: "error"; message: string };

export class ImportTaskspaceRpu implements Rpu<ImportTaskspaceRequest, ImportTaskspaceResponse> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: ImportTaskspaceRequest): ImportTaskspaceResponse {
    try {
      const state = normalizeState(JSON.parse(request.json) as AppState);
      this.store.write(state);
      return { kind: "ok", state };
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : "Import fehlgeschlagen." };
    }
  }
}
