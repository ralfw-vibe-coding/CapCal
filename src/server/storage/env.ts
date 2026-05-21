import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loadedDotEnv: Record<string, string> | null = null;

function parseDotEnvFile(path: string) {
  if (!existsSync(path)) return {};
  const entries: Record<string, string> = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    entries[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return entries;
}

function loadDotEnv() {
  if (loadedDotEnv) return loadedDotEnv;
  loadedDotEnv = {
    ...parseDotEnvFile(resolve(process.cwd(), ".env")),
    ...parseDotEnvFile(resolve(process.cwd(), ".env.local"))
  };
  return loadedDotEnv;
}

export function getEnv(name: string) {
  const netlifyEnv = globalThis.Netlify?.env?.get(name);
  if (netlifyEnv) return netlifyEnv;
  return process.env[name] ?? loadDotEnv()[name];
}

export function getSnapshotIntervalMinutes() {
  const parsed = Number(getEnv("SNAPSHOT_INTERVAL_MINUTES") ?? "5");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function getDatabaseDirectory() {
  return resolve(process.cwd(), getEnv("DATABASE_PATH") ?? "./data");
}

declare global {
  var Netlify:
    | {
        env?: {
          get(name: string): string | undefined;
        };
      }
    | undefined;
}
