// Transitionaler Shim.
//
// Die Google-Calendar-Logik ist in die DAO-Struktur unter backend/body
// gewandert (GoogleCalendarApiProvider, External-Calendar-Domaene,
// GoogleCalendarReactor). Dieser Shim haelt die bestehenden Importpfade von
// server/index.ts und den Netlify-Functions am Leben, bis sie in Phase 9d
// migriert sind. Danach entfaellt diese Datei.

import { createBackendApp } from "../../backend/body/app";
import type { AuthUser } from "./auth";

export async function googleCalendarStatus(user: AuthUser) {
  return createBackendApp().externalCalendar.getGoogleStatus.process({ userId: user.id });
}

export function googleCalendarConnectUrl(user: AuthUser) {
  return createBackendApp().reactors.googleCalendar.connectUrl(user.id);
}

export async function googleCalendarCallback(code: string, state: string) {
  return createBackendApp().reactors.googleCalendar.handleCallback(code, state);
}

export function googleCalendarErrorRedirect(error: unknown) {
  return createBackendApp().reactors.googleCalendar.errorRedirect(error);
}

export async function googleCalendarEvents(user: AuthUser, from: string, to: string, forceRefresh = false) {
  return createBackendApp().reactors.googleCalendar.getEvents(user.id, from, to, forceRefresh);
}

export async function refreshGoogleCalendars(user: AuthUser) {
  return createBackendApp().reactors.googleCalendar.refreshCalendars(user.id);
}

export async function updateGoogleCalendarSelection(user: AuthUser, selectedCalendarIds: unknown) {
  return createBackendApp().externalCalendar.updateGoogleSelection.process({ userId: user.id, selectedCalendarIds });
}

export async function disconnectGoogleCalendar(user: AuthUser) {
  return createBackendApp().externalCalendar.disconnectGoogle.process({ userId: user.id });
}
