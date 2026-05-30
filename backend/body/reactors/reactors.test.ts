import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestOtpReactor } from "./requestOtpReactor";
import { GoogleCalendarReactor } from "./googleCalendarReactor";
import { ICloudCalendarReactor } from "./icloudCalendarReactor";
import type { StartOtpRpu } from "../domains/identity/rpus/startOtpRpu";
import type { EmailProvider } from "../external_providers/emailProvider";
import type { GoogleCalendarApiProvider } from "../external_providers/googleCalendarApiProvider";
import type { ICloudCalDavProvider } from "../external_providers/icloudCalDavProvider";
import type { ExternalCalendarDomain } from "../domains/externalCalendar/domain";

test("RequestOtpReactor composes StartOtp + email provider", async () => {
  let sent: { email: string; code: string } | null = null;
  const startOtp = { process: async () => ({ email: "a@b.c", code: "424242" }) } as unknown as StartOtpRpu;
  const email = { sendOtp: async (e: string, c: string) => { sent = { email: e, code: c }; } } as unknown as EmailProvider;
  await new RequestOtpReactor(startOtp, email).process("a@b.c");
  assert.deepEqual(sent, { email: "a@b.c", code: "424242" });
});

function googleApi(): GoogleCalendarApiProvider {
  return {
    connectUrl: (state: string) => state, // echo the signed state for the roundtrip
    exchangeCode: async () => ({ accessToken: "at", refreshToken: "rt" }),
    accessTokenFromRefreshToken: async () => "at",
    fetchEmail: async () => "g@x.de",
    fetchCalendars: async () => [{ id: "c", summary: "c", selected: true }],
    fetchEvents: async () => [
      { kind: "event", event: { eventId: "e1", startAt: "2026-05-30T09:00:00Z", endAt: "2026-05-30T10:00:00Z", allDay: false, summary: "x", transparency: "opaque", status: "confirmed", raw: {} } }
    ]
  } as unknown as GoogleCalendarApiProvider;
}

function calendarDomain(connection: Record<string, unknown>) {
  const noop = { process: async () => undefined };
  return {
    getGoogleConnection: { process: async () => connection },
    saveGoogleConnection: noop,
    getGoogleStatus: { process: async () => ({ connected: true, calendars: [] }) },
    isCacheFresh: { process: async () => false },
    cacheCalendarEvents: noop,
    readCalendarEvents: { process: async () => [{ id: "google:c:e1" }] },
    getICloudConnection: { process: async () => connection },
    saveICloudConnection: noop,
    getICloudStatus: { process: async () => ({ connected: true, calendars: [] }) }
  } as unknown as ExternalCalendarDomain;
}

test("GoogleCalendarReactor: connectUrl signs state, handleCallback verifies it", async () => {
  const reactor = new GoogleCalendarReactor(googleApi(), calendarDomain({ connected: true, refreshToken: "rt", calendars: [] }));
  const state = reactor.connectUrl(1); // fake api echoes the signed state
  const redirect = await reactor.handleCallback("code", state);
  assert.match(redirect, /gcal=connected/);
  await assert.rejects(() => reactor.handleCallback("code", "tampered.state"), /Invalid Google OAuth state/);
});

test("GoogleCalendarReactor.getEvents returns cached events", async () => {
  const reactor = new GoogleCalendarReactor(
    googleApi(),
    calendarDomain({ connected: true, refreshToken: "rt", calendars: [{ id: "c", summary: "c", selected: true }] })
  );
  const result = await reactor.getEvents(1, "2026-05-01", "2026-05-31", true);
  assert.equal(result.events.length, 1);
  assert.equal((await reactor.refreshCalendars(1)).connected, true);
  assert.match(reactor.errorRedirect(new Error("nope")), /gcal=error/);
});

function caldav(): ICloudCalDavProvider {
  return {
    fetchCalendars: async () => [{ id: "c", summary: "c", selected: true }],
    fetchEvents: async () => []
  } as unknown as ICloudCalDavProvider;
}

test("ICloudCalendarReactor connect + getEvents", async () => {
  const reactor = new ICloudCalendarReactor(
    caldav(),
    calendarDomain({ connected: true, appleId: "id", appPassword: "pw", calendars: [{ id: "c", summary: "c", selected: true }] })
  );
  assert.equal((await reactor.connect(1, "id", "pw")).connected, true);
  const events = await reactor.getEvents(1, "2026-05-01", "2026-05-31", true);
  assert.ok(Array.isArray(events.events));
  await assert.rejects(() => reactor.connect(1, "", "pw"), /Apple ID/);

  // not connected -> empty events without touching the provider
  const offline = new ICloudCalendarReactor(caldav(), calendarDomain({ connected: false, calendars: [] }));
  assert.deepEqual(await offline.getEvents(1, "2026-05-01", "2026-05-31", false), { events: [] });
});
