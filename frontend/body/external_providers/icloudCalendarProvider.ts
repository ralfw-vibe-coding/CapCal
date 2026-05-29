// External Provider: Proxy auf die iCloud-Calendar-Endpunkte des Backends.
// Externe Kalender sind nicht Teil der Taskspace-Domaene.

import type { GoogleCalendarEvent, ICloudCalendarState } from "../domain/types";
import { apiErrorMessage } from "./http";

export class ICloudCalendarProvider {
  async loadStatus(refresh: boolean): Promise<ICloudCalendarState> {
    const response = await fetch(refresh ? "/api/icloud/calendars" : "/api/icloud/status", { credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as ICloudCalendarState;
  }

  async connect(appleId: string, appPassword: string): Promise<ICloudCalendarState> {
    const response = await fetch("/api/icloud/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ appleId, appPassword })
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as ICloudCalendarState;
  }

  async updateSelection(selectedCalendarIds: string[]): Promise<ICloudCalendarState> {
    const response = await fetch("/api/icloud/calendars", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ selectedCalendarIds })
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as ICloudCalendarState;
  }

  async disconnect(): Promise<ICloudCalendarState> {
    const response = await fetch("/api/icloud/disconnect", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as ICloudCalendarState;
  }

  async loadEvents(from: string, to: string, forceRefresh: boolean): Promise<GoogleCalendarEvent[]> {
    const response = await fetch(
      `/api/icloud/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${forceRefresh ? "&refresh=1" : ""}`,
      { credentials: "same-origin" }
    );
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return ((await response.json()) as { events?: GoogleCalendarEvent[] }).events ?? [];
  }
}
