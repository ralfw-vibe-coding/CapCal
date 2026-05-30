import { test } from "node:test";
import assert from "node:assert/strict";
import { ICloudCalDavProvider } from "./icloudCalDavProvider";

// Fetch-Mock mit einer Antwort-Warteschlange (CalDAV macht mehrere Requests).
function installFetchQueue(bodies: string[]) {
  let i = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(bodies[Math.min(i++, bodies.length - 1)], { status: 207 })) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

const principalXml = `<multistatus><response><propstat><status>HTTP/1.1 200 OK</status><prop><current-user-principal><href>/principal/</href></current-user-principal></prop></propstat></response></multistatus>`;
const homeXml = `<multistatus><response><propstat><status>HTTP/1.1 200 OK</status><prop><calendar-home-set><href>/home/</href></calendar-home-set></prop></propstat></response></multistatus>`;
const calendarsXml = `<multistatus><response><href>/home/work/</href><propstat><status>HTTP/1.1 200 OK</status><prop><displayname>Work</displayname><resourcetype><collection/><calendar/></resourcetype><calendar-color>#fff</calendar-color><supported-calendar-component-set><comp name="VEVENT"/></supported-calendar-component-set></prop></propstat></response></multistatus>`;
const eventsXml = `<multistatus><response><href>/home/work/ev1.ics</href><propstat><status>HTTP/1.1 200 OK</status><prop><calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:ev1
DTSTART:20260530T090000Z
DTEND:20260530T100000Z
SUMMARY:Meeting
END:VEVENT
END:VCALENDAR</calendar-data></prop></propstat></response></multistatus>`;

test("fetchCalendars discovers the home url and maps VEVENT calendars", async () => {
  const restore = installFetchQueue([principalXml, homeXml, calendarsXml]);
  try {
    const calendars = await new ICloudCalDavProvider().fetchCalendars("id", "pw", new Set());
    assert.equal(calendars.length, 1);
    assert.equal(calendars[0].summary, "Work");
    assert.match(calendars[0].id, /\/home\/work\//);
  } finally {
    restore();
  }
});

test("fetchEvents parses ICS into cacheable events within the range", async () => {
  const restore = installFetchQueue([eventsXml]);
  try {
    const events = await new ICloudCalDavProvider().fetchEvents("id", "pw", "https://caldav.icloud.com/home/work/", "2026-05-01", "2026-05-31");
    assert.equal(events.length, 1);
    assert.equal(events[0].summary, "Meeting");
    assert.equal(events[0].eventId, "ev1");
  } finally {
    restore();
  }
});
