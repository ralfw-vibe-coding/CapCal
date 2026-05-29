// Transitionaler Shim.
//
// Die Auth-Logik ist in die DAO-Struktur unter backend/body gewandert
// (Identity-Domaene, Email-Provider, RequestOtp-Reactor, Head-Session). Dieser
// Shim haelt die bestehenden Importpfade der Netlify-Functions und der
// Kalender-Module am Leben, bis sie in Phase 9d/9c migriert sind. Danach
// entfaellt diese Datei (siehe requirements/refactoring-cleanup.md).

import { createBackendApp } from "../../backend/body/app";
import { IdentityStore } from "../../backend/body/domains/identity/providers/identityStore";
import { bearerToken } from "../../backend/body/head/session";
import type { UserProfile } from "../../backend/body/domains/identity/types";

export type { AuthUser, UserProfile, UserSettings } from "../../backend/body/domains/identity/types";
export { getSessionUser, sessionCookie, clearSessionCookie, isAuthRequired } from "../../backend/body/head/session";

export async function ensureAuthSchema() {
  await new IdentityStore().ensureSchema();
}

export async function requestOtp(email: string) {
  await createBackendApp().reactors.requestOtp.process(email);
}

export async function verifyOtp(email: string, otp: string) {
  return createBackendApp().identity.consumeOtp.process({ email, token: otp });
}

export async function getApiKeyUser(authorizationHeader?: string | null) {
  return createBackendApp().identity.findUserByApiKey.process({ apiKey: bearerToken(authorizationHeader) ?? "" });
}

export async function getUserSettings(user: { id: number }) {
  return createBackendApp().identity.getUserSettings.process({ userId: user.id });
}

export async function updateUserProfile(user: { id: number }, profile: UserProfile) {
  return createBackendApp().identity.updateProfile.process({ userId: user.id, profile });
}

export async function rotateApiKey(user: { id: number }) {
  return createBackendApp().identity.rotateApiKey.process({ userId: user.id });
}
