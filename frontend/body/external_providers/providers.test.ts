import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthProvider } from "./authProvider";
import { UserSettingsProvider } from "./userSettingsProvider";
import { GoogleCalendarProvider } from "./googleCalendarProvider";
import { ICloudCalendarProvider } from "./icloudCalendarProvider";
import { apiErrorMessage } from "./http";

type Call = { url: string; method: string; body?: string };

// Installiert ein Fake-fetch, das eine feste Antwort liefert und Aufrufe merkt.
function installFetch(status: number, payload: unknown) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: init?.body });
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    return new Response(body, { status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("AuthProvider.me returns the user or null on 401", async () => {
  let fx = installFetch(200, { user: { id: 1, email: "a@b.c" } });
  try {
    assert.deepEqual(await new AuthProvider().me(), { id: 1, email: "a@b.c" });
    assert.equal(fx.calls[0].url, "/api/auth/me");
  } finally {
    fx.restore();
  }
  fx = installFetch(401, { error: "no" });
  try {
    assert.equal(await new AuthProvider().me(), null);
  } finally {
    fx.restore();
  }
});

test("AuthProvider.requestOtp/verify post to the right endpoints and throw on error", async () => {
  let fx = installFetch(200, { user: { id: 1, email: "a@b.c" } });
  try {
    await new AuthProvider().requestOtp("a@b.c");
    assert.equal(fx.calls[0].url, "/api/auth/request-otp");
    assert.equal(fx.calls[0].method, "POST");
    const user = await new AuthProvider().verify("a@b.c", "123456");
    assert.deepEqual(user, { id: 1, email: "a@b.c" });
  } finally {
    fx.restore();
  }
  fx = installFetch(400, "bad code");
  try {
    await assert.rejects(() => new AuthProvider().verify("a@b.c", "000000"), /bad code/);
    await assert.rejects(() => new AuthProvider().requestOtp("x"), /bad code/);
  } finally {
    fx.restore();
  }
});

test("AuthProvider.logout posts to logout", async () => {
  const fx = installFetch(200, { ok: true });
  try {
    await new AuthProvider().logout();
    assert.equal(fx.calls[0].url, "/api/auth/logout");
    assert.equal(fx.calls[0].method, "POST");
  } finally {
    fx.restore();
  }
});

test("UserSettingsProvider load/update/rotate parse and throw via apiErrorMessage", async () => {
  const settings = { user: { id: 1, email: "a@b.c" }, profile: {} };
  let fx = installFetch(200, settings);
  try {
    assert.deepEqual(await new UserSettingsProvider().load(), settings);
    await new UserSettingsProvider().updateProfile({ name: "R" });
    assert.equal(fx.calls[1].method, "PUT");
    await new UserSettingsProvider().rotateApiKey();
    assert.equal(fx.calls[2].url, "/api/user-settings/api-key");
  } finally {
    fx.restore();
  }
  fx = installFetch(500, { error: "kaputt" });
  try {
    await assert.rejects(() => new UserSettingsProvider().load(), /kaputt/);
  } finally {
    fx.restore();
  }
});

test("GoogleCalendarProvider hits status/calendars/disconnect/events and builds the connect url", async () => {
  const state = { connected: true, calendars: [] };
  const fx = installFetch(200, state);
  try {
    const p = new GoogleCalendarProvider();
    assert.equal(p.connectUrl(), "/api/auth/gcal/connect");
    await p.loadStatus(false);
    assert.equal(fx.calls[0].url, "/api/gcal/status");
    await p.loadStatus(true);
    assert.equal(fx.calls[1].url, "/api/gcal/calendars");
    await p.updateSelection(["c"]);
    assert.equal(fx.calls[2].method, "PUT");
    await p.disconnect();
    assert.equal(fx.calls[3].url, "/api/gcal/disconnect");
  } finally {
    fx.restore();
  }
});

test("GoogleCalendarProvider.loadEvents returns the events array", async () => {
  const fx = installFetch(200, { events: [{ id: "x" }] });
  try {
    const events = await new GoogleCalendarProvider().loadEvents("2026-05-01", "2026-05-31", true);
    assert.equal(events.length, 1);
    assert.match(fx.calls[0].url, /refresh=1/);
  } finally {
    fx.restore();
  }
});

test("ICloudCalendarProvider status/connect/calendars/events/disconnect", async () => {
  const state = { connected: true, calendars: [] };
  const fx = installFetch(200, state);
  try {
    const p = new ICloudCalendarProvider();
    await p.loadStatus(false);
    assert.equal(fx.calls[0].url, "/api/icloud/status");
    await p.connect("id", "pw");
    assert.equal(fx.calls[1].url, "/api/icloud/connect");
    await p.updateSelection([]);
    await p.disconnect();
    await p.loadEvents("2026-05-01", "2026-05-31", false);
    assert.match(fx.calls[4].url, /\/api\/icloud\/events/);
  } finally {
    fx.restore();
  }
});

test("apiErrorMessage prefers the JSON error field, falls back to text", async () => {
  assert.equal(await apiErrorMessage(new Response(JSON.stringify({ error: "boom" }), { status: 500 })), "boom");
  assert.equal(await apiErrorMessage(new Response("plain text", { status: 500 })), "plain text");
});
