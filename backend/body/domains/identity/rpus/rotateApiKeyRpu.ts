// Command-RPU (Identity): erzeugt einen neuen API-Key und liefert die
// Einstellungen samt Klartext-Key (nur dieses eine Mal).

import { randomBytes } from "node:crypto";
import type { IdentityStore } from "../providers/identityStore";
import type { UserSettings } from "../types";
import type { Rpu } from "./rpu";

export type RotateApiKeyRequest = { userId: number };
export type RotateApiKeyResponse = UserSettings & { apiKey: string };

export class RotateApiKeyRpu implements Rpu<RotateApiKeyRequest, Promise<RotateApiKeyResponse>> {
  constructor(private readonly store: IdentityStore) {}

  async process(request: RotateApiKeyRequest): Promise<RotateApiKeyResponse> {
    await this.store.ensureSchema();
    const apiKey = `capcal_${randomBytes(24).toString("base64url")}`;
    await this.store.setApiKey(request.userId, apiKey);
    return { ...(await this.store.getUserSettings(request.userId)), apiKey };
  }
}
