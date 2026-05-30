// External Provider: Proxy auf die User-Settings-Endpunkte des Backends.
// Benutzerprofil und API-Key sind nicht Teil der Taskspace-Domaene.

import type { UserProfile, UserSettingsState } from "../domain/types";
import { apiErrorMessage } from "./http";

export class UserSettingsProvider {
  async load(): Promise<UserSettingsState> {
    const response = await fetch("/api/user-settings", { credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as UserSettingsState;
  }

  async updateProfile(profile: UserProfile): Promise<UserSettingsState> {
    const response = await fetch("/api/user-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ profile })
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as UserSettingsState;
  }

  async rotateApiKey(): Promise<UserSettingsState> {
    const response = await fetch("/api/user-settings/api-key", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as UserSettingsState;
  }
}
