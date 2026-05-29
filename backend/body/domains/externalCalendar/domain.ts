// Composition Root der External-Calendar-Domaene (Persistenz: Verbindungs-
// Settings + Event-Cache).

import { CalendarStore } from "./providers/calendarStore";
import { CacheCalendarEventsRpu, IsCacheFreshRpu, ReadCalendarEventsRpu } from "./rpus/cacheRpus";
import {
  DisconnectGoogleRpu,
  GetGoogleConnectionRpu,
  GetGoogleStatusRpu,
  SaveGoogleConnectionRpu,
  UpdateGoogleSelectionRpu
} from "./rpus/googleConnectionRpus";

export function createExternalCalendarDomain() {
  const store = new CalendarStore();
  return {
    getGoogleConnection: new GetGoogleConnectionRpu(store),
    saveGoogleConnection: new SaveGoogleConnectionRpu(store),
    getGoogleStatus: new GetGoogleStatusRpu(store),
    updateGoogleSelection: new UpdateGoogleSelectionRpu(store),
    disconnectGoogle: new DisconnectGoogleRpu(store),
    readCalendarEvents: new ReadCalendarEventsRpu(),
    isCacheFresh: new IsCacheFreshRpu(),
    cacheCalendarEvents: new CacheCalendarEventsRpu()
  };
}

export type ExternalCalendarDomain = ReturnType<typeof createExternalCalendarDomain>;
