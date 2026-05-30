import { getEnv } from "../../../env";
import { FilesystemStateProvider } from "./filesystem";
import { PostgresStateProvider } from "./postgres";
import type { StateProvider } from "./types";

export function createStateProvider(): StateProvider {
  const provider = getEnv("STATE_PROVIDER") ?? "filesystem";
  if (provider === "filesystem") return new FilesystemStateProvider();
  if (provider === "postgres") return new PostgresStateProvider();
  throw new Error(`Unsupported STATE_PROVIDER: ${provider}`);
}
