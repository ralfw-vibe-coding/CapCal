import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskspaceStateProvider } from "./taskspaceStateProvider";

function installFetch(status: number, payload: unknown) {
  const calls: { url: string; method: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("load returns ok with the raw state", async () => {
  const fx = installFetch(200, { tasks: [], prioTaskIds: [], bookings: [] });
  try {
    const result = await new TaskspaceStateProvider().load();
    assert.equal(result.kind, "ok");
    assert.equal(fx.calls[0].url, "/api/state");
  } finally {
    fx.restore();
  }
});

test("load reports unauthorized on 401", async () => {
  const fx = installFetch(401, { error: "no" });
  try {
    assert.equal((await new TaskspaceStateProvider().load()).kind, "unauthorized");
  } finally {
    fx.restore();
  }
});

test("load throws on other errors", async () => {
  const fx = installFetch(500, "server boom");
  try {
    await assert.rejects(() => new TaskspaceStateProvider().load(), /server boom/);
  } finally {
    fx.restore();
  }
});

test("save PUTs the state and throws on error", async () => {
  let fx = installFetch(200, {});
  try {
    await new TaskspaceStateProvider().save({ tasks: [], prioTaskIds: [], bookings: [] } as never, { keepalive: true });
    assert.equal(fx.calls[0].method, "PUT");
  } finally {
    fx.restore();
  }
  fx = installFetch(500, "nope");
  try {
    await assert.rejects(() => new TaskspaceStateProvider().save({ tasks: [], prioTaskIds: [], bookings: [] } as never), /nope/);
  } finally {
    fx.restore();
  }
});
