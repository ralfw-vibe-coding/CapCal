import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabaseDirectory, getSnapshotIntervalMinutes } from "./env";
import { emptyState, type AppState, type StateProvider } from "./types";

export class FilesystemStateProvider implements StateProvider {
  private readonly directory = getDatabaseDirectory();
  private readonly statePath = join(this.directory, "capcal.json");
  private readonly historyDirectory = join(this.directory, "state-history");

  async load() {
    await mkdir(this.directory, { recursive: true });
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as AppState;
    } catch {
      await this.saveCurrent(emptyState);
      return emptyState;
    }
  }

  async save(state: AppState) {
    await this.saveCurrent(state);
    if (await this.shouldWriteSnapshot()) {
      await mkdir(this.historyDirectory, { recursive: true });
      const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      await writeFile(join(this.historyDirectory, filename), JSON.stringify(state, null, 2));
    }
  }

  private async saveCurrent(state: AppState) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  private async shouldWriteSnapshot() {
    await mkdir(this.historyDirectory, { recursive: true });
    const files = await readdir(this.historyDirectory);
    if (files.length === 0) return true;

    let newestMtime = 0;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fileStat = await stat(join(this.historyDirectory, file));
      newestMtime = Math.max(newestMtime, fileStat.mtimeMs);
    }

    if (!newestMtime) return true;
    return Date.now() - newestMtime >= getSnapshotIntervalMinutes() * 60_000;
  }
}
