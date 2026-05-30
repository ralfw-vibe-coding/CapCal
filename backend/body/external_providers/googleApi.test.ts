import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleCalendarApiProvider } from "./googleCalendarApiProvider";

function installFetch(payload: unknown, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status })) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("connectUrl builds a Google OAuth url carrying the state", () => {
  const url = new GoogleCalendarApiProvider().connectUrl("signed-state");
  assert.match(url, /accounts\.google\.com/);
  assert.match(url, /state=signed-state/);
  assert.match(url, /access_type=offline/);
});

test("exchangeCode returns access + refresh token", async () => {
  const restore = installFetch({ access_token: "at", refresh_token: "rt" });
  try {
    assert.deepEqual(await new GoogleCalendarApiProvider().exchangeCode("code"), { accessToken: "at", refreshToken: "rt" });
  } finally {
    restore();
  }
});

test("exchangeCode throws when Google omits the access token", async () => {
  const restore = installFetch({ error_description: "bad" }, 400);
  try {
    await assert.rejects(() => new GoogleCalendarApiProvider().exchangeCode("code"), /bad/);
  } finally {
    restore();
  }
});

test("fetchCalendars maps the calendar list", async () => {
  const restore = installFetch({ items: [{ id: "c1", summary: "Work", backgroundColor: "#fff" }] });
  try {
    const calendars = await new GoogleCalendarApiProvider().fetchCalendars("at", new Set(["c1"]));
    assert.equal(calendars[0].id, "c1");
    assert.equal(calendars[0].selected, true);
  } finally {
    restore();
  }
});

test("fetchEvents yields event + cancelled outcomes", async () => {
  const restore = installFetch({
    items: [
      { id: "e1", summary: "Meeting", start: { dateTime: "2026-05-30T09:00:00Z" }, end: { dateTime: "2026-05-30T10:00:00Z" }, status: "confirmed" },
      { id: "e2", status: "cancelled" }
    ]
  });
  try {
    const outcomes = await new GoogleCalendarApiProvider().fetchEvents("at", "c1", "2026-05-01", "2026-05-31");
    assert.equal(outcomes.filter((o) => o.kind === "event").length, 1);
    assert.equal(outcomes.filter((o) => o.kind === "cancelled").length, 1);
  } finally {
    restore();
  }
});

test("fetchEmail reads the address", async () => {
  const restore = installFetch({ email: "g@x.de" });
  try {
    assert.equal(await new GoogleCalendarApiProvider().fetchEmail("at"), "g@x.de");
  } finally {
    restore();
  }
});
