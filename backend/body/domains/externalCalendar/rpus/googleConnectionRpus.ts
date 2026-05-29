// RPUs der External-Calendar-Domaene fuer die Google-Verbindung.
//
// Persistenz-Capabilities ueber dem CalendarStore. Die Status-Varianten liefern
// die oeffentliche Sicht (ohne Token); GetGoogleConnection liefert die interne
// Verbindung inkl. Refresh-Token fuer den Reactor.

import type { CalendarStore } from "../providers/calendarStore";
import type { GoogleConnection, PublicCalendarStatus } from "../types";
import type { Rpu } from "./rpu";

function toPublic(connection: GoogleConnection): PublicCalendarStatus {
  return {
    connected: connection.connected,
    googleEmail: connection.googleEmail,
    calendars: connection.calendars,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt
  };
}

export class GetGoogleConnectionRpu implements Rpu<{ userId: number }, Promise<GoogleConnection>> {
  constructor(private readonly store: CalendarStore) {}
  process(request: { userId: number }): Promise<GoogleConnection> {
    return this.store.loadGoogle(request.userId);
  }
}

export class SaveGoogleConnectionRpu implements Rpu<{ userId: number; connection: GoogleConnection }, Promise<void>> {
  constructor(private readonly store: CalendarStore) {}
  process(request: { userId: number; connection: GoogleConnection }): Promise<void> {
    return this.store.saveGoogle(request.userId, request.connection);
  }
}

export class GetGoogleStatusRpu implements Rpu<{ userId: number }, Promise<PublicCalendarStatus>> {
  constructor(private readonly store: CalendarStore) {}
  async process(request: { userId: number }): Promise<PublicCalendarStatus> {
    return toPublic(await this.store.loadGoogle(request.userId));
  }
}

export class UpdateGoogleSelectionRpu
  implements Rpu<{ userId: number; selectedCalendarIds: unknown }, Promise<PublicCalendarStatus>>
{
  constructor(private readonly store: CalendarStore) {}
  async process(request: { userId: number; selectedCalendarIds: unknown }): Promise<PublicCalendarStatus> {
    const connection = await this.store.loadGoogle(request.userId);
    const selectedIds = new Set(
      Array.isArray(request.selectedCalendarIds)
        ? request.selectedCalendarIds.filter((id): id is string => typeof id === "string")
        : []
    );
    const next: GoogleConnection = {
      ...connection,
      calendars: connection.calendars.map((calendar) => ({ ...calendar, selected: selectedIds.has(calendar.id) })),
      updatedAt: new Date().toISOString()
    };
    await this.store.saveGoogle(request.userId, next);
    return toPublic(next);
  }
}

export class DisconnectGoogleRpu implements Rpu<{ userId: number }, Promise<PublicCalendarStatus>> {
  constructor(private readonly store: CalendarStore) {}
  async process(request: { userId: number }): Promise<PublicCalendarStatus> {
    const next: GoogleConnection = { connected: false, calendars: [], updatedAt: new Date().toISOString() };
    await this.store.saveGoogle(request.userId, next);
    return toPublic(next);
  }
}
