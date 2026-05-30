// External Provider: iCloud-CalDAV-Zugriff (Kalenderliste + Events via ICS).
//
// Reiner Client gegen iCloud CalDAV. Kein Domaenenzustand, keine Persistenz.

import ICAL from "ical.js";
import { xml2js } from "xml-js";
import type { CacheableExternalEvent, ExternalCalendarItem } from "../domains/externalCalendar/providers/calendarCache";

const iCloudServerUrl = "https://caldav.icloud.com";

type CalDavCalendar = { url: string; displayName: string; color?: string; components: string[] };
type CalDavObject = { url: string; data: string };

function addIsoDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
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

function multistatusResponses(xml: unknown) {
  const multistatus = firstChild(xml, "multistatus") ?? xml;
  return childrenByLocalName(multistatus, "response");
}

function componentNames(prop: unknown) {
  const supported = firstChild(prop, "supported-calendar-component-set");
  return childrenByLocalName(supported, "comp")
    .map((component) => {
      const attrs = component && typeof component === "object" ? (component as Record<string, unknown>)._attributes : undefined;
      const name = attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>).name : undefined;
      return typeof name === "string" ? name.toUpperCase() : "";
    })
    .filter(Boolean);
}

function compactDateTime(date: string) {
  return `${date.replaceAll("-", "")}T000000Z`;
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
    raw: { description: event.description || undefined, location: event.location || undefined, organizer, attendeeSummary, ics: rawData }
  };
}

export class ICloudCalDavProvider {
  private async davXmlRequest(
    url: string,
    method: "PROPFIND" | "REPORT",
    appleId: string,
    appPassword: string,
    body: string,
    depth: "0" | "1" = "0"
  ) {
    const response = await fetch(url, {
      method,
      headers: { authorization: basicAuthHeader(appleId, appPassword), depth, "content-type": "application/xml; charset=utf-8" },
      body
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`iCloud CalDAV ${method} failed (${response.status}): ${text.slice(0, 240)}`);
    return xml2js(text, { compact: true, ignoreDeclaration: true }) as Record<string, unknown>;
  }

  private async discoverCalendarHomeUrl(appleId: string, appPassword: string) {
    const principalXml = await this.davXmlRequest(
      iCloudServerUrl,
      "PROPFIND",
      appleId,
      appPassword,
      `<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`
    );
    const principalResponse = multistatusResponses(principalXml)[0];
    const principalHref = childText(firstChild(propFromResponse(principalResponse), "current-user-principal"), "href");
    if (!principalHref) throw new Error("iCloud did not return a CalDAV principal URL");

    const homeXml = await this.davXmlRequest(
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

  async fetchCalendars(appleId: string, appPassword: string, selectedIds = new Set<string>()): Promise<ExternalCalendarItem[]> {
    const homeUrl = await this.discoverCalendarHomeUrl(appleId, appPassword);
    const xml = await this.davXmlRequest(
      homeUrl,
      "PROPFIND",
      appleId,
      appPassword,
      `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/"><D:prop><D:displayname/><D:resourcetype/><A:calendar-color/><C:supported-calendar-component-set/></D:prop></D:propfind>`,
      "1"
    );
    const calendars = multistatusResponses(xml)
      .map((response): CalDavCalendar | null => {
        const href = childText(response, "href");
        const prop = propFromResponse(response);
        if (!href || !prop) return null;
        const resourceType = firstChild(prop, "resourcetype");
        if (childrenByLocalName(resourceType, "calendar").length === 0) return null;
        return {
          url: resolveDavUrl(href),
          displayName: childText(prop, "displayname") ?? href,
          color: childText(prop, "calendar-color"),
          components: componentNames(prop)
        };
      })
      .filter((calendar): calendar is CalDavCalendar => Boolean(calendar));

    return calendars
      .filter((calendar) => (calendar.components ?? []).length === 0 || calendar.components?.includes("VEVENT"))
      .map((calendar): ExternalCalendarItem => ({
        id: calendar.url,
        summary: calendar.displayName,
        color: calendar.color,
        selected: selectedIds.has(calendar.url),
        syncedAt: new Date().toISOString()
      }));
  }

  async fetchEvents(appleId: string, appPassword: string, calendarUrl: string, from: string, to: string): Promise<CacheableExternalEvent[]> {
    const xml = await this.davXmlRequest(
      calendarUrl,
      "REPORT",
      appleId,
      appPassword,
      `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${compactDateTime(from)}" end="${compactDateTime(addIsoDays(to, 1))}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`,
      "1"
    );
    const objects = multistatusResponses(xml)
      .map((response): CalDavObject | null => {
        const href = childText(response, "href");
        const data = childText(propFromResponse(response), "calendar-data");
        if (!href || !data) return null;
        return { url: resolveDavUrl(href), data };
      })
      .filter((object): object is CalDavObject => Boolean(object));

    const fromTime = dateToIcalTime(from);
    const toTime = dateToIcalTime(addIsoDays(to, 1));
    const parsed: CacheableExternalEvent[] = [];
    for (const object of objects) {
      const component = new ICAL.Component(ICAL.parse(object.data));
      for (const vevent of component.getAllSubcomponents("vevent")) {
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
            const cacheable = eventToCacheable(event, `${event.uid}:${next.toString()}`, object.data, next);
            if (cacheable) parsed.push(cacheable);
          }
          continue;
        }
        if (event.endDate.compare(fromTime) <= 0 || event.startDate.compare(toTime) >= 0) continue;
        const cacheable = eventToCacheable(event, event.uid || object.url, object.data);
        if (cacheable) parsed.push(cacheable);
      }
    }
    return parsed;
  }
}
