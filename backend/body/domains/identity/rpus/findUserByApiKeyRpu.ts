// Query-RPU (Identity): ermittelt den Nutzer zu einem API-Key (oder null).

import type { IdentityStore } from "../providers/identityStore";
import type { AuthUser } from "../types";
import type { Rpu } from "./rpu";

export type FindUserByApiKeyRequest = { apiKey: string };

export class FindUserByApiKeyRpu implements Rpu<FindUserByApiKeyRequest, Promise<AuthUser | null>> {
  constructor(private readonly store: IdentityStore) {}

  async process(request: FindUserByApiKeyRequest): Promise<AuthUser | null> {
    if (!request.apiKey) return null;
    await this.store.ensureSchema();
    return this.store.findUserByApiKey(request.apiKey);
  }
}
