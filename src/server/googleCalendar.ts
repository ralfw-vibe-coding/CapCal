import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { AuthUser } from "./auth";
import { ensureAuthSchema } from "./auth";
import { getEnv } from "./storage/env";

export type GoogleCalendarItem = {
  id: string;
  summary: string;
  color?: string;
  selected: boolean;
  syncedAt?: string;
};

export type GoogleCalendarSettings = {
  connected: boolean;
  googleEmail?: string;
  refreshTokenEncrypted?: string;
  calendars: GoogleCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};

export type GoogleCalendarExternalEvent = {
  id: string;
  calendarId: string;
  calendarSummary: string;
  calendarColor?: string;
  summary: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  blocksTime: boolean;
  htmlLink?: string;
};

const googleScopes = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
const eventCacheMaxAgeMinutes = 5;

function sql() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Google Calendar");
  return neon(databaseUrl);
}

function secret() {
  return getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
}

function encryptionKey() {
  const configured = getEnv("GCAL_TOKEN_ENCRYPTION_KEY") ?? secret();
  const hex = configured.trim();
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  return createHash("sha256").update(configured).digest();
}

function encrypt(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(payload: string) {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid Google token payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function createState(user: AuthUser) {
  const payload = Buffer.from(JSON.stringify({ userId: user.id, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: number; expiresAt: number };
  if (!Number.isFinite(decoded.userId) || decoded.expiresAt < Date.now()) return null;
  return decoded.userId;
}

function redirectUri() {
  const value = getEnv("GOOGLE_REDIRECT_URI");
  if (!value) throw new Error("GOOGLE_REDIRECT_URI is required for Google Calendar");
  return value;
}

function appRedirectUrl(status: "connected" | "error", message?: string) {
  const configured = getEnv("APP_BASE_URL");
  const fallback = redirectUri().includes("localhost:3001") ? "http://127.0.0.1:5173" : new URL(redirectUri()).origin;
  const target = new URL(configured ?? fallback);
  target.searchParams.set("gcal", status);
  if (message) target.searchParams.set("message", message);
  return target.toString();
}

function googleConfig() {
  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  return { clientId, clientSecret, redirectUri: redirectUri() };
}

function normalizeGoogleCalendarSettings(raw: unknown): GoogleCalendarSettings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const calendars = Array.isArray(input.calendars) ? input.calendars : [];
  return {
    connected: input.connected === true,
    googleEmail: typeof input.googleEmail === "string" ? input.googleEmail : undefined,
    refreshTokenEncrypted: typeof input.refreshTokenEncrypted === "string" ? input.refreshTokenEncrypted : undefined,
    connectedAt: typeof input.connectedAt === "string" ? input.connectedAt : undefined,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
    calendars: calendars
      .map((item): GoogleCalendarItem | null => {
        const calendar = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (typeof calendar.id !== "string") return null;
        return {
          id: calendar.id,
          summary: typeof calendar.summary === "string" ? calendar.summary : calendar.id,
          color: typeof calendar.color === "string" ? calendar.color : undefined,
          selected: calendar.selected === true,
          syncedAt: typeof calendar.syncedAt === "string" ? calendar.syncedAt : undefined
        };
      })
      .filter((item): item is GoogleCalendarItem => Boolean(item))
  };
}

function publicSettings(settings: GoogleCalendarSettings) {
  return {
    connected: settings.connected,
    googleEmail: settings.googleEmail,
    calendars: settings.calendars,
    connectedAt: settings.connectedAt,
    updatedAt: settings.updatedAt
  };
}

async function loadStoredSettings(userId: number) {
  await ensureGoogleSchema();
  const rows = (await sql()`
    SELECT google_calendar
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as { google_calendar: unknown }[];
  return normalizeGoogleCalendarSettings(rows[0]?.google_calendar);
}

async function saveStoredSettings(userId: number, settings: GoogleCalendarSettings) {
  await ensureGoogleSchema();
  const result = (await sql()`
    UPDATE users
    SET google_calendar = ${JSON.stringify(settings)}::jsonb
    WHERE id = ${userId}
    RETURNING id
  `) as { id: number }[];
  if (result.length === 0) throw new Error(`User ${userId} not found for Google Calendar settings`);
}

async function ensureGoogleSchema() {
  await ensureAuthSchema();
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar JSONB NOT NULL DEFAULT '{}'`;
  await sql()`
    CREATE TABLE IF NOT EXISTS google_calendar_event_cache (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      calendar_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      all_day BOOLEAN NOT NULL DEFAULT false,
      summary TEXT,
      transparency TEXT,
      status TEXT,
      html_link TEXT,
      updated_at TIMESTAMPTZ,
      raw JSONB,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, calendar_id, event_id)
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS google_calendar_event_cache_range ON google_calendar_event_cache (user_id, calendar_id, start_at, end_at)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS google_calendar_cache_windows (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      calendar_id TEXT NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, calendar_id, from_date, to_date)
    )
  `;
}

export async function googleCalendarStatus(user: AuthUser) {
  return publicSettings(await loadStoredSettings(user.id));
}

export function googleCalendarConnectUrl(user: AuthUser) {
  const config = googleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleScopes.join(" "));
  url.searchParams.set("state", createState(user));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error_description === "string" ? payload.error_description : "Google token request failed");
  return payload;
}

async function accessTokenFromRefreshToken(refreshTokenEncrypted: string) {
  const config = googleConfig();
  const payload = await tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decrypt(refreshTokenEncrypted),
      grant_type: "refresh_token"
    })
  );
  if (typeof payload.access_token !== "string") throw new Error("Google did not return an access token");
  return payload.access_token;
}

async function fetchGoogleEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as { email?: unknown };
  if (!response.ok) throw new Error("Google profile request failed");
  return typeof payload.email === "string" ? payload.email : undefined;
}

async function fetchCalendars(accessToken: string, selectedIds = new Set<string>()): Promise<GoogleCalendarItem[]> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as { items?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Google calendars could not be loaded");
  if (!Array.isArray(payload.items)) throw new Error("Google calendar response did not contain a calendar list");
  return payload.items
    .map((item): GoogleCalendarItem | null => {
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
    .filter((item): item is GoogleCalendarItem => Boolean(item));
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateParam(value: string, name: string) {
  if (!isDateString(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  return value;
}

function dateTimeForDate(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function addIsoDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function eventDateTime(raw: unknown, fallbackEnd = false) {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (typeof value.dateTime === "string") return { value: value.dateTime, allDay: false };
  if (typeof value.date === "string") return { value: dateTimeForDate(value.date, fallbackEnd), allDay: true };
  return null;
}

type GoogleRawEvent = {
  id?: string;
  summary?: string;
  start?: unknown;
  end?: unknown;
  transparency?: string;
  status?: string;
  htmlLink?: string;
  updated?: string;
};

function normalizeGoogleEvent(raw: GoogleRawEvent) {
  if (!raw.id) return null;
  const start = eventDateTime(raw.start);
  const end = eventDateTime(raw.end, true);
  if (!start || !end) return null;
  const allDay = start.allDay || end.allDay;
  const transparency = raw.transparency ?? "opaque";
  return {
    eventId: raw.id,
    startAt: start.value,
    endAt: end.value,
    allDay,
    summary: raw.summary ?? "(Ohne Titel)",
    transparency,
    status: raw.status ?? "confirmed",
    htmlLink: raw.htmlLink,
    updatedAt: raw.updated
  };
}

async function fetchGoogleEvents(accessToken: string, calendarId: string, from: string, to: string) {
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
  return payload.items as GoogleRawEvent[];
}

async function refreshEventsForCalendar(userId: number, accessToken: string, calendarId: string, from: string, to: string) {
  const events = await fetchGoogleEvents(accessToken, calendarId, from, to);
  const db = sql();
  for (const rawEvent of events) {
    if (!rawEvent.id) continue;
    if (rawEvent.status === "cancelled") {
      await db`
        DELETE FROM google_calendar_event_cache
        WHERE user_id = ${userId}
          AND calendar_id = ${calendarId}
          AND event_id = ${rawEvent.id}
      `;
      continue;
    }
    const event = normalizeGoogleEvent(rawEvent);
    if (!event) continue;
    await db`
      INSERT INTO google_calendar_event_cache (
        user_id,
        calendar_id,
        event_id,
        start_at,
        end_at,
        all_day,
        summary,
        transparency,
        status,
        html_link,
        updated_at,
        raw,
        cached_at
      )
      VALUES (
        ${userId},
        ${calendarId},
        ${event.eventId},
        ${event.startAt},
        ${event.endAt},
        ${event.allDay},
        ${event.summary},
        ${event.transparency},
        ${event.status},
        ${event.htmlLink ?? null},
        ${event.updatedAt ?? null},
        ${JSON.stringify(rawEvent)}::jsonb,
        NOW()
      )
      ON CONFLICT (user_id, calendar_id, event_id)
      DO UPDATE SET
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        all_day = EXCLUDED.all_day,
        summary = EXCLUDED.summary,
        transparency = EXCLUDED.transparency,
        status = EXCLUDED.status,
        html_link = EXCLUDED.html_link,
        updated_at = EXCLUDED.updated_at,
        raw = EXCLUDED.raw,
        cached_at = NOW()
    `;
  }
  await db`
    INSERT INTO google_calendar_cache_windows (user_id, calendar_id, from_date, to_date, cached_at)
    VALUES (${userId}, ${calendarId}, ${from}, ${to}, NOW())
    ON CONFLICT (user_id, calendar_id, from_date, to_date)
    DO UPDATE SET cached_at = NOW()
  `;
}

export async function googleCalendarEvents(user: AuthUser, fromInput: string, toInput: string, forceRefresh = false) {
  const from = normalizeDateParam(fromInput, "from");
  const to = normalizeDateParam(toInput, "to");
  const settings = await loadStoredSettings(user.id);
  if (!settings.connected || !settings.refreshTokenEncrypted) return { events: [] };

  const selectedCalendars = settings.calendars.filter((calendar) => calendar.selected);
  if (selectedCalendars.length === 0) return { events: [] };

  const db = sql();
  const accessToken = await accessTokenFromRefreshToken(settings.refreshTokenEncrypted);
  for (const calendar of selectedCalendars) {
    const freshWindowRows = (await db`
      SELECT COUNT(*)::int AS count
      FROM google_calendar_cache_windows
      WHERE user_id = ${user.id}
        AND calendar_id = ${calendar.id}
        AND from_date <= ${from}::date
        AND to_date >= ${to}::date
        AND cached_at > NOW() - (${eventCacheMaxAgeMinutes} * INTERVAL '1 minute')
    `) as { count: number }[];
    if (forceRefresh || (freshWindowRows[0]?.count ?? 0) === 0) await refreshEventsForCalendar(user.id, accessToken, calendar.id, from, to);
  }

  const calendarMetaById = new Map(selectedCalendars.map((calendar) => [calendar.id, calendar]));
  const rows = (await db`
    SELECT calendar_id, event_id, start_at, end_at, all_day, summary, transparency, status, html_link
    FROM google_calendar_event_cache
    WHERE user_id = ${user.id}
      AND calendar_id = ANY(${selectedCalendars.map((calendar) => calendar.id)})
      AND status <> 'cancelled'
      AND start_at < ${addIsoDays(to, 1)}::timestamptz
      AND end_at > ${from}::timestamptz
    ORDER BY start_at
  `) as {
    calendar_id: string;
    event_id: string;
    start_at: Date | string;
    end_at: Date | string;
    all_day: boolean;
    summary: string | null;
    transparency: string | null;
    status: string | null;
    html_link: string | null;
  }[];

  return {
    events: rows.map((row): GoogleCalendarExternalEvent => {
      const calendar = calendarMetaById.get(row.calendar_id);
      const transparency = row.transparency ?? "opaque";
      return {
        id: `${row.calendar_id}:${row.event_id}`,
        calendarId: row.calendar_id,
        calendarSummary: calendar?.summary ?? row.calendar_id,
        calendarColor: calendar?.color,
        summary: row.summary ?? "(Ohne Titel)",
        startAt: new Date(row.start_at).toISOString(),
        endAt: new Date(row.end_at).toISOString(),
        allDay: row.all_day,
        blocksTime: transparency !== "transparent",
        htmlLink: row.html_link ?? undefined
      };
    })
  };
}

export async function googleCalendarCallback(code: string, state: string) {
  const userId = verifyState(state);
  if (!userId) throw new Error("Invalid Google OAuth state");
  console.log(`[CapCal] Google Calendar callback started for user ${userId}`);
  const config = googleConfig();
  const tokenPayload = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    })
  );
  if (typeof tokenPayload.access_token !== "string") throw new Error("Google did not return an access token");
  const previous = await loadStoredSettings(userId);
  const refreshToken =
    typeof tokenPayload.refresh_token === "string"
      ? tokenPayload.refresh_token
      : previous.refreshTokenEncrypted
        ? decrypt(previous.refreshTokenEncrypted)
        : undefined;
  if (!refreshToken) throw new Error("Google did not return a refresh token");

  const selectedIds = new Set(previous.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
  let calendars = previous.calendars;
  try {
    calendars = await fetchCalendars(tokenPayload.access_token, selectedIds);
  } catch (error) {
    console.error("[CapCal] Google Calendar list could not be loaded during callback:", error);
  }
  const now = new Date().toISOString();
  await saveStoredSettings(userId, {
    connected: true,
    googleEmail: await fetchGoogleEmail(tokenPayload.access_token),
    refreshTokenEncrypted: encrypt(refreshToken),
    calendars,
    connectedAt: previous.connectedAt ?? now,
    updatedAt: now
  });
  console.log(`[CapCal] Google Calendar connected for user ${userId}: ${calendars.length} calendars`);
  return appRedirectUrl("connected");
}

export async function refreshGoogleCalendars(user: AuthUser) {
  const settings = await loadStoredSettings(user.id);
  if (!settings.connected || !settings.refreshTokenEncrypted) return publicSettings(settings);
  const selectedIds = new Set(settings.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
  const accessToken = await accessTokenFromRefreshToken(settings.refreshTokenEncrypted);
  const calendars = await fetchCalendars(accessToken, selectedIds);
  const nextSettings = { ...settings, calendars, updatedAt: new Date().toISOString() };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export async function updateGoogleCalendarSelection(user: AuthUser, selectedCalendarIds: unknown) {
  const settings = await loadStoredSettings(user.id);
  const selectedIds = new Set(Array.isArray(selectedCalendarIds) ? selectedCalendarIds.filter((id): id is string => typeof id === "string") : []);
  const nextSettings = {
    ...settings,
    calendars: settings.calendars.map((calendar) => ({ ...calendar, selected: selectedIds.has(calendar.id) })),
    updatedAt: new Date().toISOString()
  };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export async function disconnectGoogleCalendar(user: AuthUser) {
  const now = new Date().toISOString();
  const nextSettings: GoogleCalendarSettings = {
    connected: false,
    calendars: [],
    updatedAt: now
  };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export function googleCalendarErrorRedirect(error: unknown) {
  const message = error instanceof Error ? error.message : "Google Calendar connection failed";
  return appRedirectUrl("error", message);
}
