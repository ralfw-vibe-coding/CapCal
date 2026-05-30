import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCookie, clearSessionCookie, getSessionUser, bearerToken, isAuthRequired } from "./session";

test("session cookie roundtrips a user", () => {
  const cookie = sessionCookie({ id: 42, email: "a@b.c" });
  const value = cookie.split(";")[0]; // capcal_session=...
  const user = getSessionUser(value);
  assert.deepEqual(user, { id: 42, email: "a@b.c" });
});

test("getSessionUser rejects missing/tampered cookies", () => {
  assert.equal(getSessionUser(""), null);
  assert.equal(getSessionUser("capcal_session=not.a.valid.token"), null);
  const cookie = sessionCookie({ id: 1, email: "x" }).split(";")[0];
  const tampered = cookie.slice(0, -3) + "aaa";
  assert.equal(getSessionUser(tampered), null);
});

test("clearSessionCookie expires the cookie", () => {
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test("bearerToken parses Authorization header", () => {
  assert.equal(bearerToken("Bearer abc123"), "abc123");
  assert.equal(bearerToken("bearer abc123"), "abc123");
  assert.equal(bearerToken("Basic xyz"), null);
  assert.equal(bearerToken(null), null);
});

test("isAuthRequired is false without AUTH_REQUIRED/postgres", () => {
  const prevAuth = process.env.AUTH_REQUIRED;
  const prevProvider = process.env.STATE_PROVIDER;
  process.env.AUTH_REQUIRED = "false";
  process.env.STATE_PROVIDER = "filesystem";
  assert.equal(isAuthRequired(), false);
  process.env.AUTH_REQUIRED = "true";
  assert.equal(isAuthRequired(), true);
  if (prevAuth === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = prevAuth;
  if (prevProvider === undefined) delete process.env.STATE_PROVIDER;
  else process.env.STATE_PROVIDER = prevProvider;
});
