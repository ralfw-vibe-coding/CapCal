// Transitionaler Shim.
//
// Die iCloud-Calendar-Logik ist in die DAO-Struktur unter backend/body
// gewandert (ICloudCalDavProvider, External-Calendar-Domaene,
// ICloudCalendarReactor). Dieser Shim haelt die bestehenden Importpfade von
// server/index.ts und den Netlify-Functions am Leben, bis sie in Phase 9d
// migriert sind. Danach entfaellt diese Datei.

import { createBackendApp } from "../../backend/body/app";
import type { AuthUser } from "./auth";

export async function iCloudCalendarStatus(user: AuthUser) {
  return createBackendApp().externalCalendar.getICloudStatus.process({ userId: user.id });
}

export async function connectICloudCalendar(user: AuthUser, input: { appleId?: unknown; appPassword?: unknown }) {
  return createBackendApp().reactors.icloudCalendar.connect(user.id, input.appleId, input.appPassword);
}

export async function refreshICloudCalendars(user: AuthUser) {
  return createBackendApp().reactors.icloudCalendar.refreshCalendars(user.id);
}

export async function updateICloudCalendarSelection(user: AuthUser, selectedCalendarIds: unknown) {
  return createBackendApp().externalCalendar.updateICloudSelection.process({ userId: user.id, selectedCalendarIds });
}

export async function iCloudCalendarEvents(user: AuthUser, from: string, to: string, forceRefresh = false) {
  return createBackendApp().reactors.icloudCalendar.getEvents(user.id, from, to, forceRefresh);
}

export async function disconnectICloudCalendar(user: AuthUser) {
  return createBackendApp().externalCalendar.disconnectICloud.process({ userId: user.id });
}
