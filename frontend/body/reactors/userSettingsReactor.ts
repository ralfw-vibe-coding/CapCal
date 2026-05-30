// Reactor: Benutzereinstellungen laden und aendern.
//
// Kapselt den UserSettingsProvider, sodass das Portal ihn nicht direkt
// aufruft. Liefert ein einheitliches Ergebnis (Daten oder Fehlermeldung); die
// Anzeige uebernimmt das Portal.

import type { UserSettingsProvider } from "../external_providers/userSettingsProvider";
import type { UserProfile, UserSettingsState } from "../domain/types";

export type UserSettingsResult =
  | { kind: "ok"; settings: UserSettingsState }
  | { kind: "error"; message: string };

export class UserSettingsReactor {
  constructor(private readonly provider: UserSettingsProvider) {}

  async load(): Promise<UserSettingsResult> {
    return this.run(() => this.provider.load(), "User Settings konnten nicht geladen werden.");
  }

  async saveProfile(profile: UserProfile): Promise<UserSettingsResult> {
    return this.run(() => this.provider.updateProfile(profile), "Profil konnte nicht gespeichert werden.");
  }

  async rotateApiKey(): Promise<UserSettingsResult> {
    return this.run(() => this.provider.rotateApiKey(), "API-Key konnte nicht erneuert werden.");
  }

  private async run(action: () => Promise<UserSettingsState>, fallback: string): Promise<UserSettingsResult> {
    try {
      return { kind: "ok", settings: await action() };
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : fallback };
    }
  }
}
