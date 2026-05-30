import { test } from "node:test";
import assert from "node:assert/strict";
import { EmailProvider } from "./emailProvider";

test("sendOtp logs to console when no RESEND_API_KEY is set", async () => {
  const prev = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "";
  const originalLog = console.log;
  let logged = "";
  console.log = (msg?: unknown) => { logged = String(msg); };
  try {
    await new EmailProvider().sendOtp("a@b.c", "123456");
    assert.match(logged, /123456/);
  } finally {
    console.log = originalLog;
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
});

test("sendOtp posts to Resend and throws on error", async () => {
  const prev = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  globalThis.fetch = (async (url: unknown) => {
    calledUrl = String(url);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await new EmailProvider().sendOtp("a@b.c", "654321");
    assert.match(calledUrl, /api\.resend\.com/);

    globalThis.fetch = (async () => new Response("rejected", { status: 422 })) as typeof fetch;
    await assert.rejects(() => new EmailProvider().sendOtp("a@b.c", "1"), /Resend error/);
  } finally {
    globalThis.fetch = originalFetch;
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
});
