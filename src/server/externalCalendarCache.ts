import { neon } from "@neondatabase/serverless";
import { ensureAuthSchema } from "./auth";
import { getEnv } from "./storage/env";

export type ExternalCalendarProvider = "google" | "icloud";

export type ExternalCalendarItem = {
  id: string;
  summary: string;
  color?: string;
  selected: boolean;
  syncedAt?: string;
};

export type ExternalCalendarEvent = {
  id: string;
  provider: ExternalCalendarProvider;
  calendarId: string;
  calendarSummary: string;
  calendarColor?: string;
  summary: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  blocksTime: boolean;
  htmlLink?: string;
  location?: string;
  description?: string;
  organizer?: string;
  creator?: string;
  attendeeSummary?: string;
};

export type CacheableExternalEvent = {
  eventId: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  summary: string;
  description?: string;
  location?: string;
  transparency: string;
  status: string;
  htmlLink?: string;
  organizer?: string;
  creator?: string;
  attendeeSummary?: string;
  updatedAt?: string;
  raw: unknown;
};

export const externalEventCacheMaxAgeMinutes = 5;

export function sql() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) throw new Error("DATABASE_URL is required for external calendars");
  return neon(databaseUrl);
}

export function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeDateParam(value: string, name: string) {
  if (!isDateString(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  return value;
}

export function dateTimeForDate(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}

export function addIsoDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function ensureExternalCalendarSchema() {
  await ensureAuthSchema();
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS external_calendar_event_cache (
      provider TEXT NOT NULL,
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
      PRIMARY KEY (provider, user_id, calendar_id, event_id)
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS external_calendar_event_cache_range
    ON external_calendar_event_cache (provider, user_id, calendar_id, start_at, end_at)
  `;
  await db`
    CREATE TABLE IF NOT EXISTS external_calendar_cache_windows (
      provider TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      calendar_id TEXT NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (provider, user_id, calendar_id, from_date, to_date)
    )
  `;
}

export async function hasFreshCacheWindow(
  provider: ExternalCalendarProvider,
  userId: number,
  calendarId: string,
  from: string,
  to: string
) {
  const rows = (await sql()`
    SELECT COUNT(*)::int AS count
    FROM external_calendar_cache_windows
    WHERE provider = ${provider}
      AND user_id = ${userId}
      AND calendar_id = ${calendarId}
      AND from_date <= ${from}::date
      AND to_date >= ${to}::date
      AND cached_at > NOW() - (${externalEventCacheMaxAgeMinutes} * INTERVAL '1 minute')
  `) as { count: number }[];
  return (rows[0]?.count ?? 0) > 0;
}

export async function upsertExternalEvent(
  provider: ExternalCalendarProvider,
  userId: number,
  calendarId: string,
  event: CacheableExternalEvent
) {
  await sql()`
    INSERT INTO external_calendar_event_cache (
      provider,
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
      ${provider},
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
      ${JSON.stringify(event.raw)}::jsonb,
      NOW()
    )
    ON CONFLICT (provider, user_id, calendar_id, event_id)
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

export async function deleteExternalEvent(provider: ExternalCalendarProvider, userId: number, calendarId: string, eventId: string) {
  await sql()`
    DELETE FROM external_calendar_event_cache
    WHERE provider = ${provider}
      AND user_id = ${userId}
      AND calendar_id = ${calendarId}
      AND event_id = ${eventId}
  `;
}

export async function rememberCacheWindow(
  provider: ExternalCalendarProvider,
  userId: number,
  calendarId: string,
  from: string,
  to: string
) {
  await sql()`
    INSERT INTO external_calendar_cache_windows (provider, user_id, calendar_id, from_date, to_date, cached_at)
    VALUES (${provider}, ${userId}, ${calendarId}, ${from}, ${to}, NOW())
    ON CONFLICT (provider, user_id, calendar_id, from_date, to_date)
    DO UPDATE SET cached_at = NOW()
  `;
}

export async function readExternalEvents(
  provider: ExternalCalendarProvider,
  userId: number,
  selectedCalendars: ExternalCalendarItem[],
  from: string,
  to: string
) {
  if (selectedCalendars.length === 0) return [];
  const rows = (await sql()`
    SELECT calendar_id, event_id, start_at, end_at, all_day, summary, transparency, status, html_link, raw
    FROM external_calendar_event_cache
    WHERE provider = ${provider}
      AND user_id = ${userId}
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
    raw: unknown;
  }[];

  const calendarMetaById = new Map(selectedCalendars.map((calendar) => [calendar.id, calendar]));
  return rows.map((row): ExternalCalendarEvent => {
    const calendar = calendarMetaById.get(row.calendar_id);
    const transparency = row.transparency ?? "opaque";
    const raw = row.raw && typeof row.raw === "object" ? (row.raw as Record<string, unknown>) : {};
    return {
      id: `${provider}:${row.calendar_id}:${row.event_id}`,
      provider,
      calendarId: row.calendar_id,
      calendarSummary: calendar?.summary ?? row.calendar_id,
      calendarColor: calendar?.color,
      summary: row.summary ?? "(Ohne Titel)",
      startAt: new Date(row.start_at).toISOString(),
      endAt: new Date(row.end_at).toISOString(),
      allDay: row.all_day,
      blocksTime: transparency.toLowerCase() !== "transparent",
      htmlLink: row.html_link ?? undefined,
      location: typeof raw.location === "string" ? raw.location : undefined,
      description: typeof raw.description === "string" ? raw.description : undefined,
      organizer: typeof raw.organizer === "string" ? raw.organizer : undefined,
      creator: typeof raw.creator === "string" ? raw.creator : undefined,
      attendeeSummary: typeof raw.attendeeSummary === "string" ? raw.attendeeSummary : undefined
    };
  });
}
