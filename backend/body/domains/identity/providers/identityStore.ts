// Persistenz der Identity-Domaene: Nutzer, OTP-Tokens, Profil, API-Keys.
//
// Kapselt den DB-Zugriff (Neon/Postgres) und das API-Key-Hashing. Wird nur von
// den Identity-RPUs benutzt.

import { createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getEnv } from "../../../env";
import type { AuthUser, UserProfile, UserSettings } from "../types";

type UserSettingsRow = {
  id: number;
  email: string;
  profile: unknown;
  api_key_hash?: string | null;
  api_key_suffix?: string | null;
  api_key_last_used_at?: Date | string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeProfile(profile: unknown): UserProfile {
  const raw = profile && typeof profile === "object" ? (profile as Record<string, unknown>) : {};
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    initials: typeof raw.initials === "string" ? raw.initials : "",
    timezone: typeof raw.timezone === "string" ? raw.timezone : ""
  };
}

function maskApiKey(apiKeyHash?: string | null, apiKeySuffix?: string | null) {
  if (!apiKeyHash) return undefined;
  return apiKeySuffix ? `••••••••••••••••${apiKeySuffix}` : "••••••••••••••••";
}

export class IdentityStore {
  private sql() {
    const databaseUrl = getEnv("DATABASE_URL");
    if (!databaseUrl) throw new Error("DATABASE_URL is required for auth");
    return neon(databaseUrl);
  }

  private secret() {
    return getEnv("AUTH_SESSION_SECRET") ?? "capcal-local-dev-session-secret";
  }

  private hashApiKey(apiKey: string) {
    return createHmac("sha256", this.secret()).update(apiKey).digest("hex");
  }

  async ensureSchema() {
    const db = this.sql();
    await db`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_hash TEXT UNIQUE`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_suffix TEXT`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMPTZ`;
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

  async upsertUser(emailInput: string): Promise<AuthUser> {
    const db = this.sql();
    const rows = (await db`
      INSERT INTO users (email)
      VALUES (${normalizeEmail(emailInput)})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email
    `) as AuthUser[];
    return rows[0];
  }

  async createToken(userId: number, token: string) {
    const db = this.sql();
    await db`
      INSERT INTO auth_tokens (user_id, token, expires_at)
      VALUES (${userId}, ${token}, NOW() + INTERVAL '5 minutes')
    `;
  }

  async consumeToken(emailInput: string, tokenInput: string): Promise<AuthUser | null> {
    const db = this.sql();
    const rows = (await db`
      SELECT auth_tokens.id AS token_id, users.id, users.email
      FROM auth_tokens
      JOIN users ON users.id = auth_tokens.user_id
      WHERE users.email = ${normalizeEmail(emailInput)}
        AND auth_tokens.token = ${tokenInput.trim()}
        AND auth_tokens.used_at IS NULL
        AND auth_tokens.expires_at > NOW()
      ORDER BY auth_tokens.created_at DESC
      LIMIT 1
    `) as { token_id: number; id: number; email: string }[];
    const row = rows[0];
    if (!row) return null;
    await db`UPDATE auth_tokens SET used_at = NOW() WHERE id = ${row.token_id}`;
    return { id: row.id, email: row.email };
  }

  async findUserByApiKey(apiKey: string): Promise<AuthUser | null> {
    const db = this.sql();
    const rows = (await db`
      UPDATE users
      SET api_key_last_used_at = NOW()
      WHERE api_key_hash = ${this.hashApiKey(apiKey)}
      RETURNING id, email
    `) as AuthUser[];
    return rows[0] ?? null;
  }

  async getUserSettings(userId: number): Promise<UserSettings> {
    const db = this.sql();
    const rows = (await db`
      SELECT id, email, profile, api_key_hash, api_key_suffix, api_key_last_used_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `) as UserSettingsRow[];
    const row = rows[0];
    if (!row) throw new Error("User not found");
    return {
      user: { id: row.id, email: row.email },
      profile: normalizeProfile(row.profile),
      apiKeyMasked: maskApiKey(row.api_key_hash, row.api_key_suffix),
      apiKeyLastUsedAt: row.api_key_last_used_at ? new Date(row.api_key_last_used_at).toISOString() : undefined
    };
  }

  async updateProfile(userId: number, profileInput: UserProfile) {
    const db = this.sql();
    await db`
      UPDATE users
      SET profile = ${JSON.stringify(normalizeProfile(profileInput))}::jsonb
      WHERE id = ${userId}
    `;
  }

  async setApiKey(userId: number, apiKey: string) {
    const db = this.sql();
    await db`
      UPDATE users
      SET api_key_hash = ${this.hashApiKey(apiKey)}, api_key_suffix = ${apiKey.slice(-5)}, api_key_last_used_at = NULL
      WHERE id = ${userId}
    `;
  }
}
