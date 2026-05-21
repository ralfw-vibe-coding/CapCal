import { neon } from "@neondatabase/serverless";
import { getEnv, getSnapshotIntervalMinutes } from "./env";
import { emptyState, type AppState, type StateProvider } from "./types";

export class PostgresStateProvider implements StateProvider {
  private readonly sql = neon(this.requireDatabaseUrl());

  async load() {
    await this.ensureSchema();
    const rows = (await this.sql`
      SELECT data
      FROM app_state
      WHERE id = 1
      LIMIT 1
    `) as { data: AppState }[];
    return rows[0]?.data ?? emptyState;
  }

  async save(state: AppState) {
    await this.ensureSchema();
    const json = JSON.stringify(state);
    const snapshotIntervalMinutes = getSnapshotIntervalMinutes();

    await this.sql`
      INSERT INTO app_state (id, data)
      VALUES (1, ${json}::jsonb)
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;

    await this.sql`
      INSERT INTO state_history (data)
      SELECT ${json}::jsonb
      WHERE NOT EXISTS (
        SELECT 1
        FROM state_history
        WHERE saved_at > NOW() - (${snapshotIntervalMinutes} * INTERVAL '1 minute')
      )
    `;
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

    await this.sql`
      CREATE TABLE IF NOT EXISTS state_history (
        id SERIAL PRIMARY KEY,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data JSONB NOT NULL
      )
    `;
  }

  private requireDatabaseUrl() {
    const databaseUrl = getEnv("DATABASE_URL");
    if (!databaseUrl) throw new Error("DATABASE_URL is required when STATE_PROVIDER=postgres");
    return databaseUrl;
  }
}
