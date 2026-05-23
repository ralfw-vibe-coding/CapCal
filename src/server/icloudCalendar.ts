import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import ICAL from "ical.js";
import { xml2js } from "xml-js";
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

type CalDavCalendar = {
  url: string;
  displayName: string;
  color?: string;
  components: string[];
};

type CalDavObject = {
  url: string;
  data: string;
};

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

function basicAuthHeader(appleId: string, appPassword: string) {
  return `Basic ${Buffer.from(`${appleId}:${appPassword}`).toString("base64")}`;
}

function resolveDavUrl(href: string) {
  return new URL(href, iCloudServerUrl).toString();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function childrenByLocalName(node: unknown, localName: string): unknown[] {
  if (!node || typeof node !== "object") return [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "_text" || key === "_attributes") continue;
    const name = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    if (name === localName) values.push(...asArray(value));
  }
  return values;
}

function firstChild(node: unknown, localName: string) {
  return childrenByLocalName(node, localName)[0];
}

function textValue(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return undefined;
  const text = (node as Record<string, unknown>)._text;
  return typeof text === "string" ? text : undefined;
}

function childText(node: unknown, localName: string) {
  return textValue(firstChild(node, localName));
}

function propFromResponse(response: unknown) {
  for (const propstat of childrenByLocalName(response, "propstat")) {
    const status = childText(propstat, "status");
    if (status && !status.includes("200")) continue;
    const prop = firstChild(propstat, "prop");
    if (prop) return prop;
  }
  return firstChild(response, "prop");
}

async function davXmlRequest(
  url: string,
  method: "PROPFIND" | "REPORT",
  appleId: string,
  appPassword: string,
  body: string,
  depth: "0" | "1" = "0"
) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: basicAuthHeader(appleId, appPassword),
      depth,
      "content-type": "application/xml; charset=utf-8"
    },
    body
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`iCloud CalDAV ${method} failed (${response.status}): ${text.slice(0, 240)}`);
  return xml2js(text, { compact: true, ignoreDeclaration: true }) as Record<string, unknown>;
}

function multistatusResponses(xml: unknown) {
  const multistatus = firstChild(xml, "multistatus") ?? xml;
  return childrenByLocalName(multistatus, "response");
}

async function discoverCalendarHomeUrl(appleId: string, appPassword: string) {
  const principalXml = await davXmlRequest(
    iCloudServerUrl,
    "PROPFIND",
    appleId,
    appPassword,
    `<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`
  );
  const principalResponse = multistatusResponses(principalXml)[0];
  const principalHref = childText(firstChild(propFromResponse(principalResponse), "current-user-principal"), "href");
  if (!principalHref) throw new Error("iCloud did not return a CalDAV principal URL");

  const homeXml = await davXmlRequest(
    resolveDavUrl(principalHref),
    "PROPFIND",
    appleId,
    appPassword,
    `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>`
  );
  const homeResponse = multistatusResponses(homeXml)[0];
  const homeHref = childText(firstChild(propFromResponse(homeResponse), "calendar-home-set"), "href");
  if (!homeHref) throw new Error("iCloud did not return a calendar home URL");
  return resolveDavUrl(homeHref);
}

function componentNames(prop: unknown) {
  const supported = firstChild(prop, "supported-calendar-component-set");
  const components = childrenByLocalName(supported, "comp");
  return components
    .map((component) => {
      const attrs = component && typeof component === "object" ? (component as Record<string, unknown>)._attributes : undefined;
      const name = attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>).name : undefined;
      return typeof name === "string" ? name.toUpperCase() : "";
    })
    .filter(Boolean);
}

async function fetchCalDavCalendars(appleId: string, appPassword: string): Promise<CalDavCalendar[]> {
  const homeUrl = await discoverCalendarHomeUrl(appleId, appPassword);
  const xml = await davXmlRequest(
    homeUrl,
    "PROPFIND",
    appleId,
    appPassword,
    `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/"><D:prop><D:displayname/><D:resourcetype/><A:calendar-color/><C:supported-calendar-component-set/></D:prop></D:propfind>`,
    "1"
  );
  return multistatusResponses(xml)
    .map((response): CalDavCalendar | null => {
      const href = childText(response, "href");
      const prop = propFromResponse(response);
      if (!href || !prop) return null;
      const resourceType = firstChild(prop, "resourcetype");
      const isCalendar = childrenByLocalName(resourceType, "calendar").length > 0;
      if (!isCalendar) return null;
      const components = componentNames(prop);
      return {
        url: resolveDavUrl(href),
        displayName: childText(prop, "displayname") ?? href,
        color: childText(prop, "calendar-color"),
        components
      };
    })
    .filter((calendar): calendar is CalDavCalendar => Boolean(calendar));
}

function compactDateTime(date: string) {
  return `${date.replaceAll("-", "")}T000000Z`;
}

async function fetchCalDavCalendarObjects(
  appleId: string,
  appPassword: string,
  calendarUrl: string,
  from: string,
  to: string
): Promise<CalDavObject[]> {
  const xml = await davXmlRequest(
    calendarUrl,
    "REPORT",
    appleId,
    appPassword,
    `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${compactDateTime(from)}" end="${compactDateTime(addIsoDays(to, 1))}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`,
    "1"
  );
  return multistatusResponses(xml)
    .map((response): CalDavObject | null => {
      const href = childText(response, "href");
      const prop = propFromResponse(response);
      const data = childText(prop, "calendar-data");
      if (!href || !data) return null;
      return { url: resolveDavUrl(href), data };
    })
    .filter((object): object is CalDavObject => Boolean(object));
}

async function fetchICloudCalendars(appleId: string, appPassword: string, selectedIds = new Set<string>()) {
  const calendars = await fetchCalDavCalendars(appleId, appPassword);
  return calendars
    .filter((calendar) => (calendar.components ?? []).length === 0 || calendar.components?.includes("VEVENT"))
    .map((calendar): ICloudCalendarItem => ({
      id: calendar.url,
      summary: calendar.displayName,
      color: calendar.color,
      selected: selectedIds.has(calendar.url),
      syncedAt: new Date().toISOString()
    }));
}

function stripMailto(value?: string) {
  return value?.replace(/^mailto:/i, "");
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
  const objects = await fetchCalDavCalendarObjects(appleId, appPassword, calendarId, from, to);

  for (const object of objects) {
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
