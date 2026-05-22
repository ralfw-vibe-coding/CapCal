import { neon } from "@neondatabase/serverless";
import { getEnv, getSnapshotIntervalMinutes } from "./env";
import { emptyState, type AppState, type StateProvider } from "./types";

export class PostgresStateProvider implements StateProvider {
  private readonly sql = neon(this.requireDatabaseUrl());

  async load(userId?: number) {
    await this.ensureSchema();
    const rows = userId
      ? ((await this.sql`
          SELECT data
          FROM app_state
          WHERE user_id = ${userId}
          LIMIT 1
        `) as { data: AppState }[])
      : ((await this.sql`
          SELECT data
          FROM app_state
          WHERE user_id IS NULL
          ORDER BY id
          LIMIT 1
        `) as { data: AppState }[]);
    return rows[0]?.data ?? emptyState;
  }

  async save(state: AppState, userId?: number) {
    await this.ensureSchema();
    const json = JSON.stringify(state);
    const snapshotIntervalMinutes = getSnapshotIntervalMinutes();

    if (userId) {
      await this.sql`
        INSERT INTO app_state (user_id, data)
        VALUES (${userId}, ${json}::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
    } else {
      await this.sql`
        INSERT INTO app_state (id, data)
        VALUES (1, ${json}::jsonb)
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
    }

    if (userId) {
      await this.sql`
        INSERT INTO state_history (user_id, data)
        SELECT ${userId}, ${json}::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM state_history
          WHERE user_id = ${userId}
            AND saved_at > NOW() - (${snapshotIntervalMinutes} * INTERVAL '1 minute')
        )
      `;
    } else {
      await this.sql`
        INSERT INTO state_history (data)
        SELECT ${json}::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM state_history
          WHERE user_id IS NULL
            AND saved_at > NOW() - (${snapshotIntervalMinutes} * INTERVAL '1 minute')
        )
      `;
    }
  }

  private async ensureSchema() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data JSONB NOT NULL,
        CONSTRAINT app_state_singleton CHECK (id = 1)
      )
    `;

    await this.sql`ALTER TABLE app_state DROP CONSTRAINT IF EXISTS app_state_singleton`;
    await this.sql`ALTER TABLE app_state ADD COLUMN IF NOT EXISTS user_id INTEGER`;
    await this.sql`CREATE SEQUENCE IF NOT EXISTS app_state_id_seq START WITH 2`;
    await this.sql`ALTER TABLE app_state ALTER COLUMN id SET DEFAULT nextval('app_state_id_seq')`;
    await this.sql`CREATE UNIQUE INDEX IF NOT EXISTS app_state_user_id_unique ON app_state (user_id)`;

    await this.sql`
      CREATE TABLE IF NOT EXISTS state_history (
        id SERIAL PRIMARY KEY,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data JSONB NOT NULL
      )
    `;

    await this.sql`ALTER TABLE state_history ADD COLUMN IF NOT EXISTS user_id INTEGER`;
  }

  private requireDatabaseUrl() {
    const databaseUrl = getEnv("DATABASE_URL");
    if (!databaseUrl) throw new Error("DATABASE_URL is required when STATE_PROVIDER=postgres");
    return databaseUrl;
  }
}
