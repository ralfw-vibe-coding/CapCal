import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { AuthUser } from "./auth";
import { ensureAuthSchema } from "./auth";
import { getEnv } from "./storage/env";

export type GoogleCalendarItem = {
  id: string;
  summary: string;
  color?: string;
  selected: boolean;
  syncedAt?: string;
};

export type GoogleCalendarSettings = {
  connected: boolean;
  googleEmail?: string;
  refreshTokenEncrypted?: string;
  calendars: GoogleCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};

const googleScopes = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];

function sql() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Google Calendar");
  return neon(databaseUrl);
}

function secret() {
  return getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
}

function encryptionKey() {
  const configured = getEnv("GCAL_TOKEN_ENCRYPTION_KEY") ?? secret();
  const hex = configured.trim();
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  return createHash("sha256").update(configured).digest();
}

function encrypt(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(payload: string) {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid Google token payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function createState(user: AuthUser) {
  const payload = Buffer.from(JSON.stringify({ userId: user.id, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: number; expiresAt: number };
  if (!Number.isFinite(decoded.userId) || decoded.expiresAt < Date.now()) return null;
  return decoded.userId;
}

function redirectUri() {
  const value = getEnv("GOOGLE_REDIRECT_URI");
  if (!value) throw new Error("GOOGLE_REDIRECT_URI is required for Google Calendar");
  return value;
}

function appRedirectUrl(status: "connected" | "error", message?: string) {
  const configured = getEnv("APP_BASE_URL");
  const fallback = redirectUri().includes("localhost:3001") ? "http://127.0.0.1:5173" : new URL(redirectUri()).origin;
  const target = new URL(configured ?? fallback);
  target.searchParams.set("gcal", status);
  if (message) target.searchParams.set("message", message);
  return target.toString();
}

function googleConfig() {
  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  return { clientId, clientSecret, redirectUri: redirectUri() };
}

function normalizeGoogleCalendarSettings(raw: unknown): GoogleCalendarSettings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const calendars = Array.isArray(input.calendars) ? input.calendars : [];
  return {
    connected: input.connected === true,
    googleEmail: typeof input.googleEmail === "string" ? input.googleEmail : undefined,
    refreshTokenEncrypted: typeof input.refreshTokenEncrypted === "string" ? input.refreshTokenEncrypted : undefined,
    connectedAt: typeof input.connectedAt === "string" ? input.connectedAt : undefined,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
    calendars: calendars
      .map((item): GoogleCalendarItem | null => {
        const calendar = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (typeof calendar.id !== "string") return null;
        return {
          id: calendar.id,
          summary: typeof calendar.summary === "string" ? calendar.summary : calendar.id,
          color: typeof calendar.color === "string" ? calendar.color : undefined,
          selected: calendar.selected === true,
          syncedAt: typeof calendar.syncedAt === "string" ? calendar.syncedAt : undefined
        };
      })
      .filter((item): item is GoogleCalendarItem => Boolean(item))
  };
}

function publicSettings(settings: GoogleCalendarSettings) {
  return {
    connected: settings.connected,
    googleEmail: settings.googleEmail,
    calendars: settings.calendars,
    connectedAt: settings.connectedAt,
    updatedAt: settings.updatedAt
  };
}

async function loadStoredSettings(userId: number) {
  await ensureGoogleSchema();
  const rows = (await sql()`
    SELECT google_calendar
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as { google_calendar: unknown }[];
  return normalizeGoogleCalendarSettings(rows[0]?.google_calendar);
}

async function saveStoredSettings(userId: number, settings: GoogleCalendarSettings) {
  await ensureGoogleSchema();
  const result = (await sql()`
    UPDATE users
    SET google_calendar = ${JSON.stringify(settings)}::jsonb
    WHERE id = ${userId}
    RETURNING id
  `) as { id: number }[];
  if (result.length === 0) throw new Error(`User ${userId} not found for Google Calendar settings`);
}

async function ensureGoogleSchema() {
  await ensureAuthSchema();
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar JSONB NOT NULL DEFAULT '{}'`;
}

export async function googleCalendarStatus(user: AuthUser) {
  return publicSettings(await loadStoredSettings(user.id));
}

export function googleCalendarConnectUrl(user: AuthUser) {
  const config = googleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleScopes.join(" "));
  url.searchParams.set("state", createState(user));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error_description === "string" ? payload.error_description : "Google token request failed");
  return payload;
}

async function accessTokenFromRefreshToken(refreshTokenEncrypted: string) {
  const config = googleConfig();
  const payload = await tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decrypt(refreshTokenEncrypted),
      grant_type: "refresh_token"
    })
  );
  if (typeof payload.access_token !== "string") throw new Error("Google did not return an access token");
  return payload.access_token;
}

async function fetchGoogleEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as { email?: unknown };
  if (!response.ok) throw new Error("Google profile request failed");
  return typeof payload.email === "string" ? payload.email : undefined;
}

async function fetchCalendars(accessToken: string, selectedIds = new Set<string>()): Promise<GoogleCalendarItem[]> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as { items?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Google calendars could not be loaded");
  if (!Array.isArray(payload.items)) throw new Error("Google calendar response did not contain a calendar list");
  return payload.items
    .map((item): GoogleCalendarItem | null => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      if (typeof raw.id !== "string") return null;
      return {
        id: raw.id,
        summary: typeof raw.summary === "string" ? raw.summary : raw.id,
        color: typeof raw.backgroundColor === "string" ? raw.backgroundColor : undefined,
        selected: selectedIds.has(raw.id),
        syncedAt: new Date().toISOString()
      };
    })
    .filter((item): item is GoogleCalendarItem => Boolean(item));
}

export async function googleCalendarCallback(code: string, state: string) {
  const userId = verifyState(state);
  if (!userId) throw new Error("Invalid Google OAuth state");
  console.log(`[CapCal] Google Calendar callback started for user ${userId}`);
  const config = googleConfig();
  const tokenPayload = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    })
  );
  if (typeof tokenPayload.access_token !== "string") throw new Error("Google did not return an access token");
  const previous = await loadStoredSettings(userId);
  const refreshToken =
    typeof tokenPayload.refresh_token === "string"
      ? tokenPayload.refresh_token
      : previous.refreshTokenEncrypted
        ? decrypt(previous.refreshTokenEncrypted)
        : undefined;
  if (!refreshToken) throw new Error("Google did not return a refresh token");

  const selectedIds = new Set(previous.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
  let calendars = previous.calendars;
  try {
    calendars = await fetchCalendars(tokenPayload.access_token, selectedIds);
  } catch (error) {
    console.error("[CapCal] Google Calendar list could not be loaded during callback:", error);
  }
  const now = new Date().toISOString();
  await saveStoredSettings(userId, {
    connected: true,
    googleEmail: await fetchGoogleEmail(tokenPayload.access_token),
    refreshTokenEncrypted: encrypt(refreshToken),
    calendars,
    connectedAt: previous.connectedAt ?? now,
    updatedAt: now
  });
  console.log(`[CapCal] Google Calendar connected for user ${userId}: ${calendars.length} calendars`);
  return appRedirectUrl("connected");
}

export async function refreshGoogleCalendars(user: AuthUser) {
  const settings = await loadStoredSettings(user.id);
  if (!settings.connected || !settings.refreshTokenEncrypted) return publicSettings(settings);
  const selectedIds = new Set(settings.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id));
  const accessToken = await accessTokenFromRefreshToken(settings.refreshTokenEncrypted);
  const calendars = await fetchCalendars(accessToken, selectedIds);
  const nextSettings = { ...settings, calendars, updatedAt: new Date().toISOString() };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export async function updateGoogleCalendarSelection(user: AuthUser, selectedCalendarIds: unknown) {
  const settings = await loadStoredSettings(user.id);
  const selectedIds = new Set(Array.isArray(selectedCalendarIds) ? selectedCalendarIds.filter((id): id is string => typeof id === "string") : []);
  const nextSettings = {
    ...settings,
    calendars: settings.calendars.map((calendar) => ({ ...calendar, selected: selectedIds.has(calendar.id) })),
    updatedAt: new Date().toISOString()
  };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export async function disconnectGoogleCalendar(user: AuthUser) {
  const now = new Date().toISOString();
  const nextSettings: GoogleCalendarSettings = {
    connected: false,
    calendars: [],
    updatedAt: now
  };
  await saveStoredSettings(user.id, nextSettings);
  return publicSettings(nextSettings);
}

export function googleCalendarErrorRedirect(error: unknown) {
  const message = error instanceof Error ? error.message : "Google Calendar connection failed";
  return appRedirectUrl("error", message);
}
