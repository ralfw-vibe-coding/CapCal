// Reactor: orchestriert die externen Kalender (Google und iCloud).
//
// Kapselt beide Provider, sodass das Portal sie nicht direkt aufruft, und
// fasst das Aktualisieren der Events beider Quellen zu einem Ablauf zusammen.
// Technologieagnostisch; liefert einheitliche Ergebnisse, die das Portal
// anzeigt.

import type { GoogleCalendarProvider } from "../external_providers/googleCalendarProvider";
import type { ICloudCalendarProvider } from "../external_providers/icloudCalendarProvider";
import type { GoogleCalendarEvent, GoogleCalendarState, ICloudCalendarState } from "../domain/types";

export type StatusResult<S> = { kind: "ok"; state: S } | { kind: "error"; message: string };
export type EventsResult =
  | { kind: "skip" }
  | { kind: "ok"; events: GoogleCalendarEvent[] }
  | { kind: "error"; message: string };

type CalendarConnectionState = { connected: boolean; calendars: { selected: boolean }[] } | null | undefined;

function hasActiveSelection(state: CalendarConnectionState): boolean {
  return Boolean(state?.connected && state.calendars.some((calendar) => calendar.selected));
}

async function status<S>(action: () => Promise<S>, fallback: string): Promise<StatusResult<S>> {
  try {
    return { kind: "ok", state: await action() };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : fallback };
  }
}

async function events(
  enabled: boolean,
  action: () => Promise<GoogleCalendarEvent[]>,
  fallback: string
): Promise<EventsResult> {
  if (!enabled) return { kind: "skip" };
  try {
    return { kind: "ok", events: await action() };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : fallback };
  }
}

export class ExternalCalendarReactor {
  constructor(
    private readonly google: GoogleCalendarProvider,
    private readonly icloud: ICloudCalendarProvider
  ) {}

  googleConnectUrl(): string {
    return this.google.connectUrl();
  }

  loadGoogle(refresh: boolean): Promise<StatusResult<GoogleCalendarState>> {
    return status(() => this.google.loadStatus(refresh), "Google Calendar konnte nicht geladen werden.");
  }

  updateGoogleSelection(ids: string[]): Promise<StatusResult<GoogleCalendarState>> {
    return status(() => this.google.updateSelection(ids), "Kalenderauswahl konnte nicht gespeichert werden.");
  }

  disconnectGoogle(): Promise<StatusResult<GoogleCalendarState>> {
    return status(() => this.google.disconnect(), "Google Calendar konnte nicht getrennt werden.");
  }

  loadGoogleEvents(state: GoogleCalendarState | null, from: string, to: string, forceRefresh: boolean): Promise<EventsResult> {
    return events(
      hasActiveSelection(state),
      () => this.google.loadEvents(from, to, forceRefresh),
      "Google Calendar Events konnten nicht geladen werden."
    );
  }

  loadICloud(refresh: boolean): Promise<StatusResult<ICloudCalendarState>> {
    return status(() => this.icloud.loadStatus(refresh), "iCloud Kalender konnten nicht geladen werden.");
  }

  connectICloud(appleId: string, appPassword: string): Promise<StatusResult<ICloudCalendarState>> {
    return status(() => this.icloud.connect(appleId, appPassword), "iCloud konnte nicht verbunden werden.");
  }

  updateICloudSelection(ids: string[]): Promise<StatusResult<ICloudCalendarState>> {
    return status(() => this.icloud.updateSelection(ids), "iCloud-Kalenderauswahl konnte nicht gespeichert werden.");
  }

  disconnectICloud(): Promise<StatusResult<ICloudCalendarState>> {
    return status(() => this.icloud.disconnect(), "iCloud konnte nicht getrennt werden.");
  }

  loadICloudEvents(state: ICloudCalendarState | null, from: string, to: string, forceRefresh: boolean): Promise<EventsResult> {
    return events(
      hasActiveSelection(state),
      () => this.icloud.loadEvents(from, to, forceRefresh),
      "iCloud Events konnten nicht geladen werden."
    );
  }

  // Beide Quellen gemeinsam aktualisieren.
  async refreshAllEvents(
    googleState: GoogleCalendarState | null,
    icloudState: ICloudCalendarState | null,
    from: string,
    to: string
  ): Promise<{ google: EventsResult; icloud: EventsResult }> {
    const [google, icloud] = await Promise.all([
      this.loadGoogleEvents(googleState, from, to, true),
      this.loadICloudEvents(icloudState, from, to, true)
    ]);
    return { google, icloud };
  }
}
