import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalendarStore } from "../providers/calendarStore";
import type { GoogleConnection, ICloudConnection } from "../types";
import {
  GetGoogleConnectionRpu,
  GetGoogleStatusRpu,
  SaveGoogleConnectionRpu,
  UpdateGoogleSelectionRpu,
  DisconnectGoogleRpu
} from "./googleConnectionRpus";
import {
  GetICloudStatusRpu,
  UpdateICloudSelectionRpu,
  DisconnectICloudRpu
} from "./icloudConnectionRpus";

// In-Memory-Fake des CalendarStore (cast wegen privater Felder).
function fakeStore() {
  const data = {
    google: { connected: false, calendars: [] } as GoogleConnection,
    icloud: { connected: false, calendars: [] } as ICloudConnection
  };
  const store = {
    loadGoogle: async () => data.google,
    saveGoogle: async (_id: number, c: GoogleConnection) => {
      data.google = c;
    },
    loadICloud: async () => data.icloud,
    saveICloud: async (_id: number, c: ICloudConnection) => {
      data.icloud = c;
    }
  };
  return { store: store as unknown as CalendarStore, data };
}

test("Google connection save/get/status (token hidden in public status)", async () => {
  const { store } = fakeStore();
  await new SaveGoogleConnectionRpu(store).process({
    userId: 1,
    connection: { connected: true, googleEmail: "g@x.de", refreshToken: "secret", calendars: [{ id: "c", summary: "c", selected: true }] }
  });
  const connection = await new GetGoogleConnectionRpu(store).process({ userId: 1 });
  assert.equal(connection.refreshToken, "secret");
  const status = await new GetGoogleStatusRpu(store).process({ userId: 1 });
  assert.equal(status.connected, true);
  assert.equal((status as { refreshToken?: string }).refreshToken, undefined, "token not in public status");
});

test("Google selection update + disconnect", async () => {
  const { store } = fakeStore();
  await new SaveGoogleConnectionRpu(store).process({
    userId: 1,
    connection: { connected: true, refreshToken: "s", calendars: [{ id: "c1", summary: "c1", selected: false }] }
  });
  const updated = await new UpdateGoogleSelectionRpu(store).process({ userId: 1, selectedCalendarIds: ["c1"] });
  assert.equal(updated.calendars[0].selected, true);
  const off = await new DisconnectGoogleRpu(store).process({ userId: 1 });
  assert.equal(off.connected, false);
  assert.deepEqual(off.calendars, []);
});

test("iCloud status/selection/disconnect", async () => {
  const { store } = fakeStore();
  await new UpdateICloudSelectionRpu(store).process({ userId: 1, selectedCalendarIds: [] });
  assert.equal((await new GetICloudStatusRpu(store).process({ userId: 1 })).connected, false);
  assert.equal((await new DisconnectICloudRpu(store).process({ userId: 1 })).connected, false);
});
