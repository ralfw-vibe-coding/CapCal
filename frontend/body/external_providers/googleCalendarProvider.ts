// External Provider: Proxy auf die Google-Calendar-Endpunkte des Backends.
// Externe Kalender sind nicht Teil der Taskspace-Domaene.

import type { GoogleCalendarEvent, GoogleCalendarState } from "../domain/types";
import { apiErrorMessage } from "./http";

export class GoogleCalendarProvider {
  connectUrl(): string {
    return "/api/auth/gcal/connect";
  }

  async loadStatus(refresh: boolean): Promise<GoogleCalendarState> {
    const response = await fetch(refresh ? "/api/gcal/calendars" : "/api/gcal/status", { credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as GoogleCalendarState;
  }

  async updateSelection(selectedCalendarIds: string[]): Promise<GoogleCalendarState> {
    const response = await fetch("/api/gcal/calendars", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ selectedCalendarIds })
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as GoogleCalendarState;
  }

  async disconnect(): Promise<GoogleCalendarState> {
    const response = await fetch("/api/gcal/disconnect", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return (await response.json()) as GoogleCalendarState;
  }

  async loadEvents(from: string, to: string, forceRefresh: boolean): Promise<GoogleCalendarEvent[]> {
    const response = await fetch(
      `/api/gcal/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${forceRefresh ? "&refresh=1" : ""}`,
      { credentials: "same-origin" }
    );
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    return ((await response.json()) as { events?: GoogleCalendarEvent[] }).events ?? [];
  }
}
