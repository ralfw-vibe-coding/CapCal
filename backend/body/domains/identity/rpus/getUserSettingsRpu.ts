// Query-RPU (Identity): Benutzereinstellungen (Profil, maskierter API-Key).

import type { IdentityStore } from "../providers/identityStore";
import type { UserSettings } from "../types";
import type { Rpu } from "./rpu";

export type GetUserSettingsRequest = { userId: number };

export class GetUserSettingsRpu implements Rpu<GetUserSettingsRequest, Promise<UserSettings>> {
  constructor(private readonly store: IdentityStore) {}

  async process(request: GetUserSettingsRequest): Promise<UserSettings> {
    await this.store.ensureSchema();
    return this.store.getUserSettings(request.userId);
  }
}
