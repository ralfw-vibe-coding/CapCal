// Command-RPU (Identity): aktualisiert das Benutzerprofil und liefert die
// aktualisierten Einstellungen.

import type { IdentityStore } from "../providers/identityStore";
import type { UserProfile, UserSettings } from "../types";
import type { Rpu } from "./rpu";

export type UpdateProfileRequest = { userId: number; profile: UserProfile };

export class UpdateProfileRpu implements Rpu<UpdateProfileRequest, Promise<UserSettings>> {
  constructor(private readonly store: IdentityStore) {}

  async process(request: UpdateProfileRequest): Promise<UserSettings> {
    await this.store.ensureSchema();
    await this.store.updateProfile(request.userId, request.profile);
    return this.store.getUserSettings(request.userId);
  }
}
