// External Provider: Google-Calendar-/OAuth-HTTP-Aufrufe.
//
// Reiner Client gegen Google (Token-Tausch, Userinfo, Kalenderliste, Events).
// Kein Domaenenzustand, keine Persistenz. Wird nur von Reactors benutzt.

import { getEnv } from "../env";
import type { ExternalCalendarItem, CacheableExternalEvent } from "../domains/externalCalendar/providers/calendarCache";

const googleScopes = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];

function redirectUri() {
  const value = getEnv("GOOGLE_REDIRECT_URI");
  if (!value) throw new Error("GOOGLE_REDIRECT_URI is required for Google Calendar");
  return value;
}

function googleConfig() {
  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  return { clientId, clientSecret, redirectUri: redirectUri() };
}

function dateTimeForDate(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function addIsoDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

type GoogleRawEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: unknown;
  end?: unknown;
  transparency?: string;
  status?: string;
  htmlLink?: string;
  updated?: string;
  organizer?: { email?: string; displayName?: string };
  creator?: { email?: string; displayName?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
};

function eventDateTime(raw: unknown, fallbackEnd = false) {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (typeof value.dateTime === "string") return { value: value.dateTime, allDay: false };
  if (typeof value.date === "string") return { value: dateTimeForDate(value.date, fallbackEnd), allDay: true };
  return null;
}

export type GoogleEventOutcome =
  | { kind: "cancelled"; eventId: string }
  | { kind: "event"; event: CacheableExternalEvent };

export class GoogleCalendarApiProvider {
  connectUrl(state: string): string {
    const config = googleConfig();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", googleScopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }

  private async tokenRequest(body: URLSearchParams) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof payload.error_description === "string" ? payload.error_description : "Google token request failed");
    }
    return payload;
  }

  // Tauscht einen Authorization-Code; liefert access_token und (ggf.) refresh_token.
  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const config = googleConfig();
    const payload = await this.tokenRequest(
      new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code"
      })
    );
    if (typeof payload.access_token !== "string") throw new Error("Google did not return an access token");
    return {
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined
    };
  }

  async accessTokenFromRefreshToken(refreshToken: string): Promise<string> {
    const config = googleConfig();
    const payload = await this.tokenRequest(
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    );
    if (typeof payload.access_token !== "string") throw new Error("Google did not return an access token");
    return payload.access_token;
  }

  async fetchEmail(accessToken: string): Promise<string | undefined> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json()) as { email?: unknown };
    if (!response.ok) throw new Error("Google profile request failed");
    return typeof payload.email === "string" ? payload.email : undefined;
  }

  async fetchCalendars(accessToken: string, selectedIds = new Set<string>()): Promise<ExternalCalendarItem[]> {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json()) as { items?: unknown; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? "Google calendars could not be loaded");
    if (!Array.isArray(payload.items)) throw new Error("Google calendar response did not contain a calendar list");
    return payload.items
      .map((item): ExternalCalendarItem | null => {
        const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (typeof raw.id !== "string") return null;
        return {
          id: raw.id,
          summary: typeof raw.summary === "string" ? raw.summary : raw.id,
          color: typeof raw.backgroundColor === "string" ? raw.backgroundColor : undefined,
          selected: selectedIds.has(raw.id),
          syncedAt: new Date().toISOString()
        };
      })
      .filter((item): item is ExternalCalendarItem => Boolean(item));
  }

  // Holt Events eines Kalenders und liefert sie cache-fertig (inkl. Stornos).
  async fetchEvents(accessToken: string, calendarId: string, from: string, to: string): Promise<GoogleEventOutcome[]> {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", `${from}T00:00:00Z`);
    url.searchParams.set("timeMax", `${addIsoDays(to, 1)}T00:00:00Z`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "true");

    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const payload = (await response.json()) as { items?: unknown; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? "Google events could not be loaded");
    if (!Array.isArray(payload.items)) throw new Error("Google events response did not contain an event list");

    const outcomes: GoogleEventOutcome[] = [];
    for (const raw of payload.items as GoogleRawEvent[]) {
      if (!raw.id) continue;
      if (raw.status === "cancelled") {
        outcomes.push({ kind: "cancelled", eventId: raw.id });
        continue;
      }
      const start = eventDateTime(raw.start);
      const end = eventDateTime(raw.end, true);
      if (!start || !end) continue;
      const organizer = raw.organizer?.displayName ?? raw.organizer?.email;
      const creator = raw.creator?.displayName ?? raw.creator?.email;
      const attendeeSummary =
        Array.isArray(raw.attendees) && raw.attendees.length > 0 ? `${raw.attendees.length} Gäste` : undefined;
      outcomes.push({
        kind: "event",
        event: {
          eventId: raw.id,
          startAt: start.value,
          endAt: end.value,
          allDay: start.allDay || end.allDay,
          summary: raw.summary ?? "(Ohne Titel)",
          description: raw.description,
          location: raw.location,
          transparency: raw.transparency ?? "opaque",
          status: raw.status ?? "confirmed",
          htmlLink: raw.htmlLink,
          organizer,
          creator,
          attendeeSummary,
          updatedAt: raw.updated,
          raw: { ...raw, organizer, creator, attendeeSummary }
        }
      });
    }
    return outcomes;
  }
}
