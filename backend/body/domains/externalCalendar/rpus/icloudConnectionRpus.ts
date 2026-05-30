// RPUs der External-Calendar-Domaene fuer die iCloud-Verbindung.
//
// Persistenz-Capabilities ueber dem CalendarStore. Status-Varianten liefern die
// oeffentliche Sicht (ohne App-Passwort); GetICloudConnection liefert die
// interne Verbindung inkl. App-Passwort fuer den Reactor.

import type { CalendarStore } from "../providers/calendarStore";
import type { ICloudConnection, PublicCalendarStatus } from "../types";
import type { Rpu } from "./rpu";

function toPublic(connection: ICloudConnection): PublicCalendarStatus {
  return {
    connected: connection.connected,
    appleId: connection.appleId,
    calendars: connection.calendars,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt
  };
}

export class GetICloudConnectionRpu implements Rpu<{ userId: number }, Promise<ICloudConnection>> {
  constructor(private readonly store: CalendarStore) {}
  process(request: { userId: number }): Promise<ICloudConnection> {
    return this.store.loadICloud(request.userId);
  }
}

export class SaveICloudConnectionRpu implements Rpu<{ userId: number; connection: ICloudConnection }, Promise<void>> {
  constructor(private readonly store: CalendarStore) {}
  process(request: { userId: number; connection: ICloudConnection }): Promise<void> {
    return this.store.saveICloud(request.userId, request.connection);
  }
}

export class GetICloudStatusRpu implements Rpu<{ userId: number }, Promise<PublicCalendarStatus>> {
  constructor(private readonly store: CalendarStore) {}
  async process(request: { userId: number }): Promise<PublicCalendarStatus> {
    return toPublic(await this.store.loadICloud(request.userId));
  }
}

export class UpdateICloudSelectionRpu
  implements Rpu<{ userId: number; selectedCalendarIds: unknown }, Promise<PublicCalendarStatus>>
{
  constructor(private readonly store: CalendarStore) {}
  async process(request: { userId: number; selectedCalendarIds: unknown }): Promise<PublicCalendarStatus> {
    const connection = await this.store.loadICloud(request.userId);
    const selectedIds = new Set(
      Array.isArray(request.selectedCalendarIds)
        ? request.selectedCalendarIds.filter((id): id is string => typeof id === "string")
        : []
    );
    const next: ICloudConnection = {
      ...connection,
      calendars: connection.calendars.map((calendar) => ({ ...calendar, selected: selectedIds.has(calendar.id) })),
      updatedAt: new Date().toISOString()
    };
    await this.store.saveICloud(request.userId, next);
    return toPublic(next);
  }
}

export class DisconnectICloudRpu implements Rpu<{ userId: number }, Promise<PublicCalendarStatus>> {
  constructor(private readonly store: CalendarStore) {}
  async process(request: { userId: number }): Promise<PublicCalendarStatus> {
    const next: ICloudConnection = { connected: false, calendars: [], updatedAt: new Date().toISOString() };
    await this.store.saveICloud(request.userId, next);
    return toPublic(next);
  }
}
