import { test } from "node:test";
import assert from "node:assert/strict";
import { LoadStateRpu } from "./loadStateRpu";
import { SaveStateRpu } from "./saveStateRpu";
import type { AppState, StateProvider } from "../providers/stateProvider";

const state = { tasks: [], prioTaskIds: [], bookings: [] } as unknown as AppState;

test("LoadState delegates to the provider with the user id", async () => {
  let askedFor: number | undefined = -1;
  const provider: StateProvider = {
    load: async (userId?: number) => {
      askedFor = userId;
      return state;
    },
    save: async () => undefined
  };
  const result = await new LoadStateRpu(provider).process({ userId: 7 });
  assert.equal(askedFor, 7);
  assert.equal(result, state);
});

test("SaveState persists and echoes the state", async () => {
  let saved: { state: AppState; userId?: number } | null = null;
  const provider: StateProvider = {
    load: async () => state,
    save: async (s: AppState, userId?: number) => {
      saved = { state: s, userId };
    }
  };
  const result = await new SaveStateRpu(provider).process({ state, userId: 3 });
  assert.deepEqual(saved, { state, userId: 3 });
  assert.equal(result, state);
});
