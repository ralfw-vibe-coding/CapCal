// Domain State Provider des Frontends: Proxy auf den Backend-Endpunkt /api/state.
// Reines I/O, kein React, keine Domaenenlogik. Laedt und speichert den rohen
// Taskspace-Zustand; Normalisierung und Orchestrierung liegen ausserhalb.

import type { AppState } from "../types";

export type LoadStateResult =
  | { kind: "ok"; rawState: AppState }
  | { kind: "unauthorized" };

export class TaskspaceStateProvider {
  async load(): Promise<LoadStateResult> {
    const response = await fetch("/api/state", { credentials: "same-origin" });
    if (response.status === 401) return { kind: "unauthorized" };
    if (!response.ok) throw new Error(await response.text());
    return { kind: "ok", rawState: (await response.json()) as AppState };
  }

  async save(state: AppState, options: { keepalive?: boolean } = {}): Promise<void> {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
      credentials: "same-origin",
      keepalive: options.keepalive
    });
    if (!response.ok) throw new Error(await response.text());
  }
}
