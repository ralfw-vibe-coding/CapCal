// Head-Hilfen fuer HTTP-Auth-Transport: Session-Cookie-Signierung/-Pruefung,
// Bearer-Parsing und die Auth-Pflicht-Konfiguration.
//
// Das ist Transport-/Portal-Belang (kein Domaenenzustand): Cookies und ihre
// Krypto gehoeren zur HTTP-Schicht, nicht in die Identity-Domaene.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";
import type { AuthUser } from "../domains/identity/types";

const sessionCookieName = "capcal_session";
const sessionMaxAgeSeconds = 90 * 24 * 60 * 60;

function sessionSecret() {
  return getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function createSessionToken(user: AuthUser) {
  const payload = Buffer.from(
    JSON.stringify({ userId: user.id, email: user.email, expiresAt: Date.now() + sessionMaxAgeSeconds * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token: string): AuthUser | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    userId: number;
    email: string;
    expiresAt: number;
  };
  if (decoded.expiresAt < Date.now()) return null;
  return { id: decoded.userId, email: decoded.email };
}

export function sessionCookie(user: AuthUser) {
  return `${sessionCookieName}=${createSessionToken(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionUser(cookieHeader = ""): AuthUser | null {
  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${sessionCookieName}=`));
  if (!cookie) return null;
  return verifySessionToken(decodeURIComponent(cookie.slice(sessionCookieName.length + 1)));
}

export function bearerToken(authorizationHeader?: string | null) {
  const [scheme, token] = (authorizationHeader ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function isAuthRequired() {
  return getEnv("AUTH_REQUIRED") === "true" || getEnv("STATE_PROVIDER") === "postgres";
}
