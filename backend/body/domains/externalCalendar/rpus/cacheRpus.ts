// Generische Cache-RPUs der External-Calendar-Domaene (Google + iCloud).
//
// Lesen aus dem Event-Cache, Schreiben gefetchter Events und Pruefen der
// Cache-Frische. Persistenz ueber den Cache-Provider.

import {
  deleteExternalEvent,
  hasFreshCacheWindow,
  readExternalEvents,
  rememberCacheWindow,
  upsertExternalEvent,
  type CacheableExternalEvent,
  type ExternalCalendarEvent,
  type ExternalCalendarItem,
  type ExternalCalendarProvider
} from "../providers/calendarCache";
import type { Rpu } from "./rpu";

export type ReadCalendarEventsRequest = {
  provider: ExternalCalendarProvider;
  userId: number;
  selectedCalendars: ExternalCalendarItem[];
  from: string;
  to: string;
};

export class ReadCalendarEventsRpu implements Rpu<ReadCalendarEventsRequest, Promise<ExternalCalendarEvent[]>> {
  process(request: ReadCalendarEventsRequest): Promise<ExternalCalendarEvent[]> {
    return readExternalEvents(request.provider, request.userId, request.selectedCalendars, request.from, request.to);
  }
}

export type IsCacheFreshRequest = {
  provider: ExternalCalendarProvider;
  userId: number;
  calendarId: string;
  from: string;
  to: string;
};

export class IsCacheFreshRpu implements Rpu<IsCacheFreshRequest, Promise<boolean>> {
  process(request: IsCacheFreshRequest): Promise<boolean> {
    return hasFreshCacheWindow(request.provider, request.userId, request.calendarId, request.from, request.to);
  }
}

export type CacheCalendarEventsRequest = {
  provider: ExternalCalendarProvider;
  userId: number;
  calendarId: string;
  events: CacheableExternalEvent[];
  cancelledEventIds: string[];
  from: string;
  to: string;
};

export class CacheCalendarEventsRpu implements Rpu<CacheCalendarEventsRequest, Promise<void>> {
  async process(request: CacheCalendarEventsRequest): Promise<void> {
    for (const eventId of request.cancelledEventIds) {
      await deleteExternalEvent(request.provider, request.userId, request.calendarId, eventId);
    }
    for (const event of request.events) {
      await upsertExternalEvent(request.provider, request.userId, request.calendarId, event);
    }
    await rememberCacheWindow(request.provider, request.userId, request.calendarId, request.from, request.to);
  }
}
