import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("FilesystemStateProvider persists and reloads via the filesystem", async () => {
  const dir = mkdtempSync(join(tmpdir(), "capcal-fs-"));
  const prev = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = dir;
  try {
    // import after setting DATABASE_PATH (provider reads the dir at construction)
    const { FilesystemStateProvider } = await import("./filesystem");

    const provider = new FilesystemStateProvider();
    const initial = await provider.load();
    assert.ok(initial, "empty state created on first load");

    const next = { ...initial, prioTaskIds: ["x"] };
    await provider.save(next as never);
    const reloaded = await new FilesystemStateProvider().load();
    assert.deepEqual(reloaded.prioTaskIds, ["x"], "saved state is read back");
  } finally {
    if (prev === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
