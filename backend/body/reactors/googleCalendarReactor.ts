// Reactor (Backend): orchestriert die Google-Calendar-Integration.
//
// Komponiert den Google-API-External-Provider mit den Persistenz-RPUs der
// External-Calendar-Domaene. Enthaelt die OAuth-Flow-Logik (signierter State,
// Redirect-Ziele) — Transport-naher Ablauf, aber technologieagnostisch.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";
import type { ExternalCalendarDomain } from "../domains/externalCalendar/domain";
import type { PublicCalendarStatus } from "../domains/externalCalendar/types";
import type { GoogleCalendarApiProvider } from "../external_providers/googleCalendarApiProvider";

function normalizeDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  return value;
}

export class GoogleCalendarReactor {
  constructor(
    private readonly api: GoogleCalendarApiProvider,
    private readonly calendar: ExternalCalendarDomain
  ) {}

  private secret() {
    return getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
  }

  private sign(payload: string) {
    return createHmac("sha256", this.secret()).update(payload).digest("base64url");
  }

  private createState(userId: number) {
    const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }

  private verifyState(state: string): number | null {
    const [payload, signature] = state.split(".");
    if (!payload || !signature) return null;
    const expected = this.sign(payload);
    if (expected.length !== signature.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: number; expiresAt: number };
    if (!Number.isFinite(decoded.userId) || decoded.expiresAt < Date.now()) return null;
    return decoded.userId;
  }

  private redirectUri() {
    const value = getEnv("GOOGLE_REDIRECT_URI");
    if (!value) throw new Error("GOOGLE_REDIRECT_URI is required for Google Calendar");
    return value;
  }

  private appRedirectUrl(status: "connected" | "error", message?: string) {
    const configured = getEnv("APP_BASE_URL");
    const fallback = this.redirectUri().includes("localhost:3001") ? "http://127.0.0.1:5173" : new URL(this.redirectUri()).origin;
    const target = new URL(configured ?? fallback);
    target.searchParams.set("gcal", status);
    if (message) target.searchParams.set("message", message);
    return target.toString();
  }

  connectUrl(userId: number): string {
    return this.api.connectUrl(this.createState(userId));
  }

  errorRedirect(error: unknown): string {
    return this.appRedirectUrl("error", error instanceof Error ? error.message : "Google Calendar connection failed");
  }

  async handleCallback(code: string, state: string): Promise<string> {
    const userId = this.verifyState(state);
    if (!userId) throw new Error("Invalid Google OAuth state");
    const { accessToken, refreshToken: freshRefreshToken } = await this.api.exchangeCode(code);

    const previous = await this.calendar.getGoogleConnection.process({ userId });
    const refreshToken = freshRefreshToken ?? previous.refreshToken;
    if (!refreshToken) throw new Error("Google did not return a refresh token");

    const selectedIds = new Set(previous.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
    let calendars = previous.calendars;
    try {
      calendars = await this.api.fetchCalendars(accessToken, selectedIds);
    } catch (error) {
      console.error("[CapCal] Google Calendar list could not be loaded during callback:", error);
    }
    const now = new Date().toISOString();
    await this.calendar.saveGoogleConnection.process({
      userId,
      connection: {
        connected: true,
        googleEmail: await this.api.fetchEmail(accessToken),
        refreshToken,
        calendars,
        connectedAt: previous.connectedAt ?? now,
        updatedAt: now
      }
    });
    return this.appRedirectUrl("connected");
  }

  async refreshCalendars(userId: number): Promise<PublicCalendarStatus> {
    const connection = await this.calendar.getGoogleConnection.process({ userId });
    if (!connection.connected || !connection.refreshToken) {
      return this.calendar.getGoogleStatus.process({ userId });
    }
    const selectedIds = new Set(connection.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
    const accessToken = await this.api.accessTokenFromRefreshToken(connection.refreshToken);
    const calendars = await this.api.fetchCalendars(accessToken, selectedIds);
    await this.calendar.saveGoogleConnection.process({
      userId,
      connection: { ...connection, calendars, updatedAt: new Date().toISOString() }
    });
    return this.calendar.getGoogleStatus.process({ userId });
  }

  async getEvents(userId: number, fromInput: string, toInput: string, forceRefresh = false) {
    const from = normalizeDate(fromInput, "from");
    const to = normalizeDate(toInput, "to");
    const connection = await this.calendar.getGoogleConnection.process({ userId });
    if (!connection.connected || !connection.refreshToken) return { events: [] };

    const selectedCalendars = connection.calendars.filter((calendar) => calendar.selected);
    if (selectedCalendars.length === 0) return { events: [] };

    const accessToken = await this.api.accessTokenFromRefreshToken(connection.refreshToken);
    for (const calendar of selectedCalendars) {
      const fresh = await this.calendar.isCacheFresh.process({ provider: "google", userId, calendarId: calendar.id, from, to });
      if (!forceRefresh && fresh) continue;
      const outcomes = await this.api.fetchEvents(accessToken, calendar.id, from, to);
      await this.calendar.cacheCalendarEvents.process({
        provider: "google",
        userId,
        calendarId: calendar.id,
        events: outcomes.flatMap((outcome) => (outcome.kind === "event" ? [outcome.event] : [])),
        cancelledEventIds: outcomes.flatMap((outcome) => (outcome.kind === "cancelled" ? [outcome.eventId] : [])),
        from,
        to
      });
    }

    return {
      events: await this.calendar.readCalendarEvents.process({ provider: "google", userId, selectedCalendars, from, to })
    };
  }
}
