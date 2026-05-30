import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionReactor } from "./sessionReactor";
import { LoadTaskspaceRpu } from "../domain/rpus/loadTaskspaceRpu";
import { ResetTaskspaceRpu } from "../domain/rpus/resetTaskspaceRpu";
import { TaskspaceStore } from "../domain/taskspaceStore";
import type { TaskspaceStateProvider } from "../domain/providers/taskspaceStateProvider";
import type { AuthProvider } from "../external_providers/authProvider";
import type { AppState } from "../domain/types";

const emptyRaw = { tasks: [], prioTaskIds: [], bookings: [] } as unknown as AppState;

function fakeProvider(result: "ok" | "unauthorized"): TaskspaceStateProvider {
  return {
    load: async () => (result === "ok" ? { kind: "ok", rawState: emptyRaw } : { kind: "unauthorized" }),
    save: async () => undefined
  } as unknown as TaskspaceStateProvider;
}

function fakeAuth(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    me: async () => ({ id: 7, email: "a@b.c" }),
    requestOtp: async () => undefined,
    verify: async () => ({ id: 7, email: "a@b.c" }),
    logout: async () => undefined,
    ...overrides
  } as unknown as AuthProvider;
}

test("verifyOtp logs in and loads the taskspace into the store", async () => {
  const store = new TaskspaceStore();
  const reactor = new SessionReactor(fakeAuth(), new LoadTaskspaceRpu(fakeProvider("ok"), store), new ResetTaskspaceRpu(store));

  const result = await reactor.verifyOtp("a@b.c", "123456");
  assert.equal(result.kind, "ok");
  if (result.kind === "ok") {
    assert.deepEqual(result.user, { id: 7, email: "a@b.c" });
    assert.equal(result.loaded, true);
  }
  assert.ok(store.read(), "store populated by loadTaskspace");
});

test("verifyOtp surfaces an auth error without throwing", async () => {
  const store = new TaskspaceStore();
  const auth = fakeAuth({
    verify: async () => {
      throw new Error("Der Code ist ungueltig oder abgelaufen.");
    }
  });
  const reactor = new SessionReactor(auth, new LoadTaskspaceRpu(fakeProvider("ok"), store), new ResetTaskspaceRpu(store));

  const result = await reactor.verifyOtp("a@b.c", "000000");
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /ungueltig/);
  assert.equal(store.read(), null, "no taskspace loaded on failed login");
});

test("loadSession reports unauthorized when the provider has no session", async () => {
  const store = new TaskspaceStore();
  const reactor = new SessionReactor(
    fakeAuth(),
    new LoadTaskspaceRpu(fakeProvider("unauthorized"), store),
    new ResetTaskspaceRpu(store)
  );
  const result = await reactor.loadSession();
  assert.equal(result.kind, "unauthorized");
});

test("logout clears the store", async () => {
  const store = new TaskspaceStore();
  store.write(emptyRaw);
  let loggedOut = false;
  const reactor = new SessionReactor(
    fakeAuth({ logout: async () => { loggedOut = true; } }),
    new LoadTaskspaceRpu(fakeProvider("ok"), store),
    new ResetTaskspaceRpu(store)
  );
  await reactor.logout();
  assert.equal(loggedOut, true, "provider logout called");
  assert.equal(store.read(), null, "store reset");
});
