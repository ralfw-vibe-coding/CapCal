import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import ICAL from "ical.js";
import tsdav, { type DAVCalendar } from "tsdav";
import type { AuthUser } from "./auth";
import { ensureAuthSchema } from "./auth";
import {
  addIsoDays,
  ensureExternalCalendarSchema,
  hasFreshCacheWindow,
  normalizeDateParam,
  readExternalEvents,
  rememberCacheWindow,
  sql,
  upsertExternalEvent,
  type CacheableExternalEvent,
  type ExternalCalendarItem
} from "./externalCalendarCache";
import { getEnv } from "./storage/env";

export type ICloudCalendarItem = ExternalCalendarItem;

export type ICloudCalendarSettings = {
  connected: boolean;
  appleId?: string;
  appPasswordEncrypted?: string;
  calendars: ICloudCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};

type ICloudCredentialsInput = {
  appleId?: unknown;
  appPassword?: unknown;
};

const iCloudServerUrl = "https://caldav.icloud.com";
const { createDAVClient } = tsdav;

function secret() {
  return getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
}

function encryptionKey() {
  const configured = getEnv("ICLOUD_TOKEN_ENCRYPTION_KEY") ?? getEnv("CALENDAR_TOKEN_ENCRYPTION_KEY") ?? getEnv("GCAL_TOKEN_ENCRYPTION_KEY") ?? secret();
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
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid iCloud credential payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeICloudCalendarSettings(raw: unknown): ICloudCalendarSettings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const calendars = Array.isArray(input.calendars) ? input.calendars : [];
  return {
    connected: input.connected === true,
    appleId: typeof input.appleId === "string" ? input.appleId : undefined,
    appPasswordEncrypted: typeof input.appPasswordEncrypted === "string" ? input.appPasswordEncrypted : undefined,
    connectedAt: typeof input.connectedAt === "string" ? input.connectedAt : undefined,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
    calendars: calendars
      .map((item): ICloudCalendarItem | null => {
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
      .filter((item): item is ICloudCalendarItem => Boolean(item))
  };
}

function publicSettings(settings: ICloudCalendarSettings) {
  return {
    connected: settings.connected,
    appleId: settings.appleId,
    calendars: settings.calendars,
    connectedAt: settings.connectedAt,
    updatedAt: settings.updatedAt
  };
}

async function ensureICloudSchema() {
  await ensureAuthSchema();
  await ensureExternalCalendarSchema();
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS icloud_calendar JSONB NOT NULL DEFAULT '{}'`;
}

async function loadStoredSettings(userId: number) {
  await ensureICloudSchema();
  const rows = (await sql()`
    SELECT icloud_calendar
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as { icloud_calendar: unknown }[];
  return normalizeICloudCalendarSettings(rows[0]?.icloud_calendar);
}

async function saveStoredSettings(userId: number, settings: ICloudCalendarSettings) {
  await ensureICloudSchema();
  const result = (await sql()`
    UPDATE users
    SET icloud_calendar = ${JSON.stringify(settings)}::jsonb
    WHERE id = ${userId}
    RETURNING id
  `) as { id: number }[];
  if (result.length === 0) throw new Error(`User ${userId} not found for iCloud Calendar settings`);
}

async function createICloudClient(appleId: string, appPassword: string) {
  return createDAVClient({
    serverUrl: iCloudServerUrl,
    credentials: {
      username: appleId,
      password: appPassword
    },
    authMethod: "Basic",
    defaultAccountType: "caldav"
  });
}

async function fetchICloudCalendars(appleId: string, appPassword: string, selectedIds = new Set<string>()) {
  const client = await createICloudClient(appleId, appPassword);
  const calendars = await client.fetchCalendars();
  return calendars
    .filter((calendar) => (calendar.components ?? []).length === 0 || calendar.components?.includes("VEVENT"))
    .map((calendar): ICloudCalendarItem => ({
      id: calendar.url,
      summary: typeof calendar.displayName === "string" ? calendar.displayName : calendar.url,
      color: calendar.calendarColor,
      selected: selectedIds.has(calendar.url),
      syncedAt: new Date().toISOString()
    }));
}

function stripMailto(value?: string) {
  return value?.replace(/^mailto:/i, "");
}

function calendarByUrl(calendars: DAVCalendar[], url: string) {
  const calendar = calendars.find((item) => item.url === url);
  if (!calendar) throw new Error("iCloud calendar is no longer available");
  return calendar;
}

function dateToIcalTime(date: string) {
  return ICAL.Time.fromJSDate(new Date(`${date}T00:00:00Z`), true);
}

function eventToCacheable(event: ICAL.Event, eventId: string, rawData: string, occurrence?: ICAL.Time): CacheableExternalEvent | null {
  const details = occurrence ? event.getOccurrenceDetails(occurrence) : { startDate: event.startDate, endDate: event.endDate };
  const startDate = details.startDate;
  const endDate = details.endDate;
  if (!startDate || !endDate) return null;

  const component = event.component;
  const transparency = String(component.getFirstPropertyValue("transp") ?? "OPAQUE").toLowerCase();
  const status = String(component.getFirstPropertyValue("status") ?? "confirmed").toLowerCase();
  const organizerProperty = component.getFirstProperty("organizer");
  const organizer = organizerProperty
    ? (organizerProperty.getParameter("cn") as string | undefined) ?? stripMailto(String(organizerProperty.getFirstValue()))
    : undefined;
  const attendeeSummary = event.attendees.length > 0 ? `${event.attendees.length} Gäste` : undefined;

  return {
    eventId,
    startAt: startDate.toJSDate().toISOString(),
    endAt: endDate.toJSDate().toISOString(),
    allDay: startDate.isDate,
    summary: event.summary || "(Ohne Titel)",
    description: event.description || undefined,
    location: event.location || undefined,
    transparency,
    status,
    organizer,
    attendeeSummary,
    raw: {
      description: event.description || undefined,
      location: event.location || undefined,
      organizer,
      attendeeSummary,
      ics: rawData
    }
  };
}

function parseICloudEvents(data: string, objectUrl: string, from: string, to: string) {
  const component = new ICAL.Component(ICAL.parse(data));
  const vevents = component.getAllSubcomponents("vevent");
  const fromTime = dateToIcalTime(from);
  const toTime = dateToIcalTime(addIsoDays(to, 1));
  const parsed: CacheableExternalEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) continue;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next: ICAL.Time | null;
      let guard = 0;
      while ((next = iterator.next()) && guard < 1000) {
        guard += 1;
        if (next.compare(toTime) >= 0) break;
        const details = event.getOccurrenceDetails(next);
        if (details.endDate.compare(fromTime) <= 0) continue;
        const cacheable = eventToCacheable(event, `${event.uid}:${next.toString()}`, data, next);
        if (cacheable) parsed.push(cacheable);
      }
      continue;
    }

    if (event.endDate.compare(fromTime) <= 0 || event.startDate.compare(toTime) >= 0) continue;
    const cacheable = eventToCacheable(event, event.uid || objectUrl, data);
    if (cacheable) parsed.push(cacheable);
  }

  return parsed;
}

async function refreshEventsForCalendar(userId: number, appleId: string, appPassword: string, calendarId: string, from: string, to: string) {
  const client = await createICloudClient(appleId, appPassword);
  const calendars = await client.fetchCalendars();
  const calendar = calendarByUrl(calendars, calendarId);
  const objects = await client.fetchCalendarObjects({
    calendar,
    timeRange: {
      start: `${from}T00:00:00Z`,
      end: `${addIsoDays(to, 1)}T00:00:00Z`
    },
    expand: true
  });

  for (const object of objects) {
    if (typeof object.data !== "string") continue;
    const events = parseICloudEvents(object.data, object.url, from, to);
    for (const event of events) await upsertExternalEvent("icloud", userId, calendarId, event);
  }
  await rememberCacheWindow("icloud", userId, calendarId, from, to);
}

export async function iCloudCalendarStatus(user: AuthUser) {
  return publicSettings(await loadStoredSettings(user.id));
}

export async function connectICloudCalendar(user: AuthUser, input: ICloudCredentialsInput) {
  const appleId = typeof input.appleId === "string" ? input.appleId.trim() : "";
  const appPassword = typeof input.appPassword === "string" ? input.appPassword.trim() : "";
  if (!appleId) throw new Error("Apple ID is required");
  if (!appPassword) throw new Error("App-specific password is required");

  const previous = await loadStoredSettings(user.id);
  const selectedIds = new Set(previous.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
  const calendars = await fetchICloudCalendars(appleId, appPassword, selectedIds);
  const now = new Date().toISOString();
  const nextSettings: ICloudCalendarSettings = {
    connected: true,
    appleId,
    appPasswordEncrypted: encrypt(appPassword),
    calendars,
    connectedAt: previous.connectedAt ?? now,
    updatedAt: now
  };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export async function refreshICloudCalendars(user: AuthUser) {
  const settings = await loadStoredSettings(user.id);
  if (!settings.connected || !settings.appleId || !settings.appPasswordEncrypted) return publicSettings(settings);
  const selectedIds = new Set(settings.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
  const calendars = await fetchICloudCalendars(settings.appleId, decrypt(settings.appPasswordEncrypted), selectedIds);
  const nextSettings = { ...settings, calendars, updatedAt: new Date().toISOString() };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export async function updateICloudCalendarSelection(user: AuthUser, selectedCalendarIds: unknown) {
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

export async function iCloudCalendarEvents(user: AuthUser, fromInput: string, toInput: string, forceRefresh = false) {
  const from = normalizeDateParam(fromInput, "from");
  const to = normalizeDateParam(toInput, "to");
  const settings = await loadStoredSettings(user.id);
  if (!settings.connected || !settings.appleId || !settings.appPasswordEncrypted) return { events: [] };

  const selectedCalendars = settings.calendars.filter((calendar) => calendar.selected);
  if (selectedCalendars.length === 0) return { events: [] };

  const appPassword = decrypt(settings.appPasswordEncrypted);
  for (const calendar of selectedCalendars) {
    if (forceRefresh || !(await hasFreshCacheWindow("icloud", user.id, calendar.id, from, to))) {
      await refreshEventsForCalendar(user.id, settings.appleId, appPassword, calendar.id, from, to);
    }
  }

  return { events: await readExternalEvents("icloud", user.id, selectedCalendars, from, to) };
}

export async function disconnectICloudCalendar(user: AuthUser) {
  const nextSettings: ICloudCalendarSettings = {
    connected: false,
    calendars: [],
    updatedAt: new Date().toISOString()
  };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}
