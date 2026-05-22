import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getEnv } from "./storage/env";

export type AuthUser = {
  id: number;
  email: string;
};

const sessionCookieName = "capcal_session";
const sessionMaxAgeSeconds = 90 * 24 * 60 * 60;

function sql() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) throw new Error("DATABASE_URL is required for auth");
  return neon(databaseUrl);
}

export function isAuthRequired() {
  return getEnv("AUTH_REQUIRED") === "true" || getEnv("STATE_PROVIDER") === "postgres";
}

export async function ensureAuthSchema() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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

export function getSessionUser(cookieHeader = "") {
  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${sessionCookieName}=`));
  if (!cookie) return null;
  return verifySessionToken(decodeURIComponent(cookie.slice(sessionCookieName.length + 1)));
}

export async function requestOtp(emailInput: string) {
  await ensureAuthSchema();
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) throw new Error("Bitte eine gueltige E-Mail-Adresse eingeben.");
  const db = sql();
  const users = (await db`
    INSERT INTO users (email)
    VALUES (${email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email
  `) as AuthUser[];
  const user = users[0];
  const token = randomInt(100000, 1000000).toString();
  await db`
    INSERT INTO auth_tokens (user_id, token, expires_at)
    VALUES (${user.id}, ${token}, NOW() + INTERVAL '5 minutes')
  `;
  await sendOtpEmail(email, token);
}

export async function verifyOtp(emailInput: string, tokenInput: string) {
  await ensureAuthSchema();
  const email = normalizeEmail(emailInput);
  const token = tokenInput.trim();
  const db = sql();
  const rows = (await db`
    SELECT auth_tokens.id AS token_id, users.id, users.email
    FROM auth_tokens
    JOIN users ON users.id = auth_tokens.user_id
    WHERE users.email = ${email}
      AND auth_tokens.token = ${token}
      AND auth_tokens.used_at IS NULL
      AND auth_tokens.expires_at > NOW()
    ORDER BY auth_tokens.created_at DESC
    LIMIT 1
  `) as { token_id: number; id: number; email: string }[];
  const row = rows[0];
  if (!row) throw new Error("Der Code ist ungueltig oder abgelaufen.");
  await db`UPDATE auth_tokens SET used_at = NOW() WHERE id = ${row.token_id}`;
  return { id: row.id, email: row.email };
}

async function sendOtpEmail(email: string, token: string) {
  const apiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("AUTH_FROM_EMAIL") ?? "CapCal <onboarding@resend.dev>";
  if (!apiKey) {
    console.log(`[CapCal] OTP fuer ${email}: ${token}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID()
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Dein CapCal Login-Code",
      text: `Dein CapCal Login-Code lautet: ${token}\n\nDer Code ist 5 Minuten gueltig.`
    })
  });
  if (!response.ok) throw new Error(`Resend error: ${await response.text()}`);
}
