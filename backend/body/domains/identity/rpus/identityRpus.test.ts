import { test } from "node:test";
import assert from "node:assert/strict";
import type { IdentityStore } from "../providers/identityStore";
import type { AuthUser, UserProfile, UserSettings } from "../types";
import { StartOtpRpu } from "./startOtpRpu";
import { ConsumeOtpRpu } from "./consumeOtpRpu";
import { FindUserByApiKeyRpu } from "./findUserByApiKeyRpu";
import { GetUserSettingsRpu } from "./getUserSettingsRpu";
import { UpdateProfileRpu } from "./updateProfileRpu";
import { RotateApiKeyRpu } from "./rotateApiKeyRpu";

// In-Memory-Fake des IdentityStore (cast wegen privater Felder der Klasse).
function fakeStore() {
  const state = {
    profile: {} as UserProfile,
    apiKey: undefined as string | undefined,
    tokens: [] as { email: string; token: string }[]
  };
  const user: AuthUser = { id: 1, email: "a@b.c" };
  const store = {
    ensureSchema: async () => {},
    upsertUser: async (_email: string) => user,
    createToken: async (_userId: number, token: string) => {
      state.tokens.push({ email: user.email, token });
    },
    consumeToken: async (email: string, token: string) =>
      state.tokens.some((t) => t.email === email && t.token === token) ? user : null,
    findUserByApiKey: async (apiKey: string) => (apiKey === state.apiKey ? user : null),
    getUserSettings: async (): Promise<UserSettings> => ({
      user,
      profile: state.profile,
      apiKeyMasked: state.apiKey ? "••••••••••••••••" + state.apiKey.slice(-5) : undefined
    }),
    updateProfile: async (_id: number, profile: UserProfile) => {
      state.profile = profile;
    },
    setApiKey: async (_id: number, apiKey: string) => {
      state.apiKey = apiKey;
    }
  };
  return { store: store as unknown as IdentityStore, state };
}

test("StartOtp validates email, creates a user + token, returns a 6-digit code", async () => {
  const { store, state } = fakeStore();
  const result = await new StartOtpRpu(store).process({ email: "  A@B.c " });
  assert.equal(result.email, "a@b.c");
  assert.match(result.code, /^\d{6}$/);
  assert.equal(state.tokens.length, 1);
  await assert.rejects(() => new StartOtpRpu(store).process({ email: "nope" }), /gueltige E-Mail/);
});

test("ConsumeOtp returns the user for a valid token and throws otherwise", async () => {
  const { store } = fakeStore();
  const { code } = await new StartOtpRpu(store).process({ email: "a@b.c" });
  const user = await new ConsumeOtpRpu(store).process({ email: "a@b.c", token: code });
  assert.deepEqual(user, { id: 1, email: "a@b.c" });
  await assert.rejects(() => new ConsumeOtpRpu(store).process({ email: "a@b.c", token: "000000" }), /ungueltig/);
});

test("FindUserByApiKey returns null for empty/unknown keys", async () => {
  const { store } = fakeStore();
  assert.equal(await new FindUserByApiKeyRpu(store).process({ apiKey: "" }), null);
  assert.equal(await new FindUserByApiKeyRpu(store).process({ apiKey: "wrong" }), null);
});

test("UpdateProfile then GetUserSettings reflects the change", async () => {
  const { store } = fakeStore();
  const updated = await new UpdateProfileRpu(store).process({ userId: 1, profile: { name: "Ralf" } });
  assert.equal(updated.profile.name, "Ralf");
  const read = await new GetUserSettingsRpu(store).process({ userId: 1 });
  assert.equal(read.profile.name, "Ralf");
});

test("RotateApiKey issues a capcal_ key and a masked value, findable afterwards", async () => {
  const { store } = fakeStore();
  const result = await new RotateApiKeyRpu(store).process({ userId: 1 });
  assert.match(result.apiKey, /^capcal_/);
  assert.ok(result.apiKeyMasked);
  assert.ok(await new FindUserByApiKeyRpu(store).process({ apiKey: result.apiKey }));
});
