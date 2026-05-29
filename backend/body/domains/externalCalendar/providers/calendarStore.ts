// Persistenz der External-Calendar-Verbindung (Settings auf der users-Tabelle)
// inkl. Verschluesselung des Google-Refresh-Tokens. Nur von den
// External-Calendar-RPUs benutzt.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv } from "../../../env";
import { ensureExternalCalendarSchema, sql } from "./calendarCache";
import type { ExternalCalendarItem, GoogleConnection } from "../types";

function normalizeCalendars(raw: unknown): ExternalCalendarItem[] {
  const calendars = Array.isArray(raw) ? raw : [];
  return calendars
    .map((item): ExternalCalendarItem | null => {
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
    .filter((item): item is ExternalCalendarItem => Boolean(item));
}

export class CalendarStore {
  private encryptionKey() {
    const configured = getEnv("GCAL_TOKEN_ENCRYPTION_KEY") ?? getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
    const hex = configured.trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
    return createHash("sha256").update(configured).digest();
  }

  private encrypt(text: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
  }

  private decrypt(payload: string) {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
    if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid Google token payload");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
  }

  async ensureGoogleSchema() {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar JSONB NOT NULL DEFAULT '{}'`;
    await ensureExternalCalendarSchema();
  }

  async loadGoogle(userId: number): Promise<GoogleConnection> {
    await this.ensureGoogleSchema();
    const rows = (await sql()`
      SELECT google_calendar
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `) as { google_calendar: unknown }[];
    const input = rows[0]?.google_calendar && typeof rows[0].google_calendar === "object"
      ? (rows[0].google_calendar as Record<string, unknown>)
      : {};
    const refreshTokenEncrypted = typeof input.refreshTokenEncrypted === "string" ? input.refreshTokenEncrypted : undefined;
    return {
      connected: input.connected === true,
      googleEmail: typeof input.googleEmail === "string" ? input.googleEmail : undefined,
      refreshToken: refreshTokenEncrypted ? this.decrypt(refreshTokenEncrypted) : undefined,
      calendars: normalizeCalendars(input.calendars),
      connectedAt: typeof input.connectedAt === "string" ? input.connectedAt : undefined,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined
    };
  }

  async saveGoogle(userId: number, connection: GoogleConnection): Promise<void> {
    await this.ensureGoogleSchema();
    const stored = {
      connected: connection.connected,
      googleEmail: connection.googleEmail,
      refreshTokenEncrypted: connection.refreshToken ? this.encrypt(connection.refreshToken) : undefined,
      calendars: connection.calendars,
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt
    };
    const result = (await sql()`
      UPDATE users
      SET google_calendar = ${JSON.stringify(stored)}::jsonb
      WHERE id = ${userId}
      RETURNING id
    `) as { id: number }[];
    if (result.length === 0) throw new Error(`User ${userId} not found for Google Calendar settings`);
  }
}
