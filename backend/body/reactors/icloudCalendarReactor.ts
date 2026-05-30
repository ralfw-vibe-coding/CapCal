// Reactor (Backend): orchestriert die iCloud-Calendar-Integration.
//
// Komponiert den iCloud-CalDAV-External-Provider mit den Persistenz-RPUs der
// External-Calendar-Domaene (Verbindung verbinden, Kalender/Events mit Cache).

import type { ExternalCalendarDomain } from "../domains/externalCalendar/domain";
import type { PublicCalendarStatus } from "../domains/externalCalendar/types";
import type { ICloudCalDavProvider } from "../external_providers/icloudCalDavProvider";

function normalizeDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  return value;
}

export class ICloudCalendarReactor {
  constructor(
    private readonly caldav: ICloudCalDavProvider,
    private readonly calendar: ExternalCalendarDomain
  ) {}

  async connect(userId: number, appleIdInput: unknown, appPasswordInput: unknown): Promise<PublicCalendarStatus> {
    const appleId = typeof appleIdInput === "string" ? appleIdInput.trim() : "";
    const appPassword = typeof appPasswordInput === "string" ? appPasswordInput.trim() : "";
    if (!appleId) throw new Error("Apple ID is required");
    if (!appPassword) throw new Error("App-specific password is required");

    const previous = await this.calendar.getICloudConnection.process({ userId });
    const selectedIds = new Set(previous.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
    const calendars = await this.caldav.fetchCalendars(appleId, appPassword, selectedIds);
    const now = new Date().toISOString();
    await this.calendar.saveICloudConnection.process({
      userId,
      connection: {
        connected: true,
        appleId,
        appPassword,
        calendars,
        connectedAt: previous.connectedAt ?? now,
        updatedAt: now
      }
    });
    return this.calendar.getICloudStatus.process({ userId });
  }

  async refreshCalendars(userId: number): Promise<PublicCalendarStatus> {
    const connection = await this.calendar.getICloudConnection.process({ userId });
    if (!connection.connected || !connection.appleId || !connection.appPassword) {
      return this.calendar.getICloudStatus.process({ userId });
    }
    const selectedIds = new Set(connection.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
    const calendars = await this.caldav.fetchCalendars(connection.appleId, connection.appPassword, selectedIds);
    await this.calendar.saveICloudConnection.process({
      userId,
      connection: { ...connection, calendars, updatedAt: new Date().toISOString() }
    });
    return this.calendar.getICloudStatus.process({ userId });
  }

  async getEvents(userId: number, fromInput: string, toInput: string, forceRefresh = false) {
    const from = normalizeDate(fromInput, "from");
    const to = normalizeDate(toInput, "to");
    const connection = await this.calendar.getICloudConnection.process({ userId });
    if (!connection.connected || !connection.appleId || !connection.appPassword) return { events: [] };

    const selectedCalendars = connection.calendars.filter((calendar) => calendar.selected);
    if (selectedCalendars.length === 0) return { events: [] };

    for (const calendar of selectedCalendars) {
      const fresh = await this.calendar.isCacheFresh.process({ provider: "icloud", userId, calendarId: calendar.id, from, to });
      if (!forceRefresh && fresh) continue;
      const events = await this.caldav.fetchEvents(connection.appleId, connection.appPassword, calendar.id, from, to);
      await this.calendar.cacheCalendarEvents.process({
        provider: "icloud",
        userId,
        calendarId: calendar.id,
        events,
        cancelledEventIds: [],
        from,
        to
      });
    }

    return {
      events: await this.calendar.readCalendarEvents.process({ provider: "icloud", userId, selectedCalendars, from, to })
    };
  }
}
