import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalDatabase } from "./db";
import { resolveDefaultDownloadDirectory, SettingsService } from "./settings";

test("keeps the default macOS download directory inside Rajio application data", () => {
  assert.equal(
    resolveDefaultDownloadDirectory(
      "darwin",
      "Rajio",
      "/Users/listener/Library/Application Support",
      "/Users/listener/Downloads",
    ),
    "/Users/listener/Library/Application Support/Rajio/Downloads",
  );
});

test("persists string desktop settings and ignores non-string values", async () => {
  const db = createTestDatabase();
  const settings = new SettingsService(db);

  try {
    await settings.set({
      syncAuthToken: "token",
      syncBaseUrl: "https://sync.example",
      // Runtime guard for values coming from IPC boundaries.
      unexpectedBoolean: true,
    } as Record<string, unknown>);

    assert.deepEqual(await settings.get(), {
      syncAuthToken: "token",
      syncBaseUrl: "https://sync.example",
    });
  } finally {
    db.close();
  }
});

test("uses the desktop default download directory until the user chooses another", async () => {
  const db = createTestDatabase();
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-downloads-"));
  const defaultDownloadDirectory = path.join(root, "default");
  const selectedDownloadDirectory = path.join(root, "selected");
  const settings = new SettingsService(db, defaultDownloadDirectory);

  try {
    assert.deepEqual(await settings.get(), {
      downloadDirectory: defaultDownloadDirectory,
    });

    assert.equal(
      await settings.setDownloadDirectory(selectedDownloadDirectory),
      selectedDownloadDirectory,
    );
    assert.deepEqual(await settings.get(), {
      downloadDirectory: selectedDownloadDirectory,
    });
    await assert.rejects(() => settings.setDownloadDirectory("relative/downloads"), {
      message: "Download directory must be an absolute path.",
    });
  } finally {
    db.close();
  }
});

function createTestDatabase(): LocalDatabase {
  return new LocalDatabase(path.join(mkdtempSync(path.join(tmpdir(), "newcastle-")), "test.sqlite"));
}

test("collection rules and outbox survive reopening as one transaction", async () => {
  const filename = path.join(mkdtempSync(path.join(tmpdir(), "rajio-collections-")), "library.sqlite");
  let db = new LocalDatabase(filename);
  try {
    const settings = new SettingsService(db);
    await settings.set({ playbackQueue: JSON.stringify({ version: 1, episodeIds: ["a", "", "a", "b"] }) });
    const canonical = db.getSettings().playbackQueue;
    assert.deepEqual(JSON.parse(canonical!).episodeIds, ["a", "b"]);
    assert.equal(db.listOutbox().length, 1);
    await settings.set({ playbackQueue: canonical });
    assert.equal(db.listOutbox().length, 1);
    db.close();
    db = new LocalDatabase(filename);
    assert.equal(db.getSettings().playbackQueue, canonical);
    assert.equal(db.listOutbox()[0].kind, "collection.queue.v1");
    const append = db.appendOutbox.bind(db);
    db.appendOutbox = () => { throw new Error("disk failure"); };
    await assert.rejects(new SettingsService(db).set({
      favoriteEpisodes: JSON.stringify({ version: 1, episodeIds: ["b"] }),
      language: "fr",
    }), /disk failure/);
    db.appendOutbox = append;
    assert.equal(db.getSettings().favoriteEpisodes, undefined);
    assert.equal(db.getSettings().language, undefined);
    assert.equal(db.listOutbox().length, 1);
  } finally { db.close(); }
});
