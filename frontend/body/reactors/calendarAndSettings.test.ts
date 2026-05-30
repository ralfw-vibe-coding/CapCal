import { test } from "node:test";
import assert from "node:assert/strict";
import { UserSettingsReactor } from "./userSettingsReactor";
import { ExternalCalendarReactor } from "./externalCalendarReactor";
import type { UserSettingsProvider } from "../external_providers/userSettingsProvider";
import type { GoogleCalendarProvider } from "../external_providers/googleCalendarProvider";
import type { ICloudCalendarProvider } from "../external_providers/icloudCalendarProvider";
import type { GoogleCalendarState, ICloudCalendarState, UserSettingsState } from "../domain/types";

const settings = { user: { id: 1, email: "a@b.c" }, profile: {} } as UserSettingsState;

test("UserSettingsReactor.load returns settings on success", async () => {
  const reactor = new UserSettingsReactor({ load: async () => settings } as unknown as UserSettingsProvider);
  const result = await reactor.load();
  assert.equal(result.kind, "ok");
});

test("UserSettingsReactor maps provider errors to an error result", async () => {
  const reactor = new UserSettingsReactor({
    load: async () => {
      throw new Error("boom");
    }
  } as unknown as UserSettingsProvider);
  const result = await reactor.load();
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.equal(result.message, "boom");
});

const googleState: GoogleCalendarState = { connected: true, calendars: [{ id: "c", summary: "c", selected: true }] };
const icloudState: ICloudCalendarState = { connected: true, calendars: [{ id: "c", summary: "c", selected: true }] };

function googleProvider(overrides: Partial<GoogleCalendarProvider> = {}): GoogleCalendarProvider {
  return {
    connectUrl: () => "/api/auth/gcal/connect",
    loadStatus: async () => googleState,
    updateSelection: async () => googleState,
    disconnect: async () => ({ connected: false, calendars: [] }),
    loadEvents: async () => []
    ,
    ...overrides
  } as unknown as GoogleCalendarProvider;
}

function icloudProvider(overrides: Partial<ICloudCalendarProvider> = {}): ICloudCalendarProvider {
  return {
    loadStatus: async () => icloudState,
    connect: async () => icloudState,
    updateSelection: async () => icloudState,
    disconnect: async () => ({ connected: false, calendars: [] }),
    loadEvents: async () => [],
    ...overrides
  } as unknown as ICloudCalendarProvider;
}

test("ExternalCalendarReactor.loadGoogle returns ok / maps errors", async () => {
  const ok = new ExternalCalendarReactor(googleProvider(), icloudProvider());
  assert.equal((await ok.loadGoogle(false)).kind, "ok");
  const fail = new ExternalCalendarReactor(
    googleProvider({ loadStatus: async () => { throw new Error("x"); } }),
    icloudProvider()
  );
  assert.equal((await fail.loadGoogle(false)).kind, "error");
});

test("ExternalCalendarReactor.loadGoogleEvents skips when not connected, loads when selected", async () => {
  const reactor = new ExternalCalendarReactor(googleProvider(), icloudProvider());
  assert.equal((await reactor.loadGoogleEvents(null, "2026-05-01", "2026-05-31", false)).kind, "skip");
  assert.equal((await reactor.loadGoogleEvents(googleState, "2026-05-01", "2026-05-31", false)).kind, "ok");
});

test("ExternalCalendarReactor.refreshAllEvents returns both results", async () => {
  const reactor = new ExternalCalendarReactor(googleProvider(), icloudProvider());
  const { google, icloud } = await reactor.refreshAllEvents(googleState, icloudState, "2026-05-01", "2026-05-31");
  assert.equal(google.kind, "ok");
  assert.equal(icloud.kind, "ok");
});

test("ExternalCalendarReactor connect/disconnect/selection paths", async () => {
  const reactor = new ExternalCalendarReactor(googleProvider(), icloudProvider());
  assert.equal(reactor.googleConnectUrl(), "/api/auth/gcal/connect");
  assert.equal((await reactor.updateGoogleSelection(["c"])).kind, "ok");
  assert.equal((await reactor.disconnectGoogle()).kind, "ok");
  assert.equal((await reactor.connectICloud("id", "pw")).kind, "ok");
  assert.equal((await reactor.updateICloudSelection(["c"])).kind, "ok");
  assert.equal((await reactor.disconnectICloud()).kind, "ok");
  assert.equal((await reactor.loadICloud(true)).kind, "ok");
});
