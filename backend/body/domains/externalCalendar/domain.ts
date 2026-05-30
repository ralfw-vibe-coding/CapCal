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
import {
  DisconnectICloudRpu,
  GetICloudConnectionRpu,
  GetICloudStatusRpu,
  SaveICloudConnectionRpu,
  UpdateICloudSelectionRpu
} from "./rpus/icloudConnectionRpus";

export function createExternalCalendarDomain() {
  const store = new CalendarStore();
  return {
    getGoogleConnection: new GetGoogleConnectionRpu(store),
    saveGoogleConnection: new SaveGoogleConnectionRpu(store),
    getGoogleStatus: new GetGoogleStatusRpu(store),
    updateGoogleSelection: new UpdateGoogleSelectionRpu(store),
    disconnectGoogle: new DisconnectGoogleRpu(store),
    getICloudConnection: new GetICloudConnectionRpu(store),
    saveICloudConnection: new SaveICloudConnectionRpu(store),
    getICloudStatus: new GetICloudStatusRpu(store),
    updateICloudSelection: new UpdateICloudSelectionRpu(store),
    disconnectICloud: new DisconnectICloudRpu(store),
    readCalendarEvents: new ReadCalendarEventsRpu(),
    isCacheFresh: new IsCacheFreshRpu(),
    cacheCalendarEvents: new CacheCalendarEventsRpu()
  };
}

export type ExternalCalendarDomain = ReturnType<typeof createExternalCalendarDomain>;
