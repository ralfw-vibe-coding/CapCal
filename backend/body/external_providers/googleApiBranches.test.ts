import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleCalendarApiProvider } from "./googleCalendarApiProvider";

function installFetch(payload: unknown, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status })) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("accessTokenFromRefreshToken returns the token, throws when missing", async () => {
  let restore = installFetch({ access_token: "at" });
  try {
    assert.equal(await new GoogleCalendarApiProvider().accessTokenFromRefreshToken("rt"), "at");
  } finally {
    restore();
  }
  restore = installFetch({}, 200);
  try {
    await assert.rejects(() => new GoogleCalendarApiProvider().accessTokenFromRefreshToken("rt"), /access token/);
  } finally {
    restore();
  }
});

test("fetchEvents handles all-day events (date instead of dateTime)", async () => {
  const restore = installFetch({
    items: [
      { id: "allday", summary: "Urlaub", start: { date: "2026-05-30" }, end: { date: "2026-05-31" }, status: "confirmed" },
      { id: "broken", summary: "no times", status: "confirmed" }
    ]
  });
  try {
    const outcomes = await new GoogleCalendarApiProvider().fetchEvents("at", "c", "2026-05-01", "2026-05-31");
    const events = outcomes.filter((o) => o.kind === "event");
    assert.equal(events.length, 1, "the event without start/end is skipped");
    if (events[0].kind === "event") assert.equal(events[0].event.allDay, true);
  } finally {
    restore();
  }
});

test("fetchCalendars and fetchEmail throw on HTTP errors", async () => {
  let restore = installFetch({ error: { message: "denied" } }, 403);
  try {
    await assert.rejects(() => new GoogleCalendarApiProvider().fetchCalendars("at"), /denied/);
  } finally {
    restore();
  }
  restore = installFetch({}, 500);
  try {
    await assert.rejects(() => new GoogleCalendarApiProvider().fetchEmail("at"), /profile request failed/);
  } finally {
    restore();
  }
});
