import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { LocalDatabase } from "./db";
import { DownloadService } from "./downloads";
import { PlaybackService } from "./playback";

test("downloads audio, records local file state, and playback prefers the local file", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  const downloadsDir = path.join(root, "downloads");
  seedEpisode(db);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://cdn.example/episode.mp3");
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "Content-Type": "audio/mpeg",
      },
      status: 200,
    });
  };

  try {
    const status = await new DownloadService(db, () => downloadsDir).start("episode_1");
    assert.equal(status.status, "downloaded");
    assert.equal(status.progress, 100);
    assert.ok(status.downloadedPath);
    assert.deepEqual(await readFile(status.downloadedPath), Buffer.from([1, 2, 3]));

    const source = await new PlaybackService(db).getSource("episode_1");
    assert.equal(source.isLocal, true);
    assert.equal(source.source, pathToFileURL(status.downloadedPath).toString());

    await new DownloadService(db, () => downloadsDir).delete("episode_1");
    assert.equal(existsSync(status.downloadedPath), false);
    assert.equal(db.getEpisode("episode_1")?.downloadedPath, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("downloads audio with an mp3 fallback extension when the URL has no extension", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  const downloadsDir = path.join(root, "downloads");
  seedEpisode(db, "https://cdn.example/audio");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([4, 5, 6]), { status: 200 });

  try {
    const status = await new DownloadService(db, () => downloadsDir).start("episode_1");

    assert.equal(status.status, "downloaded");
    assert.equal(path.extname(status.downloadedPath ?? ""), ".mp3");
    assert.equal(db.getEpisode("episode_1")?.fileSize, 3);
    assert.match(db.getEpisode("episode_1")?.downloadedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("resolves the download directory when each download starts", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  const firstDirectory = path.join(root, "first");
  const secondDirectory = path.join(root, "second");
  let currentDirectory = firstDirectory;
  seedEpisode(db);
  seedEpisode(db, "https://cdn.example/episode-two.mp3", "episode_2");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1]), { status: 200 });

  try {
    const service = new DownloadService(db, () => currentDirectory);
    const firstStatus = await service.start("episode_1");
    currentDirectory = secondDirectory;
    const secondStatus = await service.start("episode_2");

    assert.equal(path.dirname(firstStatus.downloadedPath ?? ""), firstDirectory);
    assert.equal(path.dirname(secondStatus.downloadedPath ?? ""), secondDirectory);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("returns missing without fetching when an episode does not exist", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    return new Response();
  };

  try {
    assert.deepEqual(
      await new DownloadService(db, () => path.join(root, "downloads")).start("missing"),
      {
        episodeId: "missing",
        progress: 0,
        status: "missing",
      },
    );
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("persists failed download status when fetch fails", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  seedEpisode(db);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 503 });

  try {
    const status = await new DownloadService(db, () => path.join(root, "downloads")).start(
      "episode_1",
    );

    assert.equal(status.status, "failed");
    assert.equal(status.progress, 0);
    assert.match(status.error ?? "", /Download failed with HTTP 503/);
    assert.equal(db.getDownloadStatus("episode_1").status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("delete clears downloaded metadata for non-downloaded or missing episodes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "newcastle-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  seedEpisode(db);
  const service = new DownloadService(db, () => path.join(root, "downloads"));

  try {
    await service.delete("episode_1");
    const status = db.getDownloadStatus("episode_1");
    assert.equal(status.episodeId, "episode_1");
    assert.equal(status.progress, 0);
    assert.equal(status.status, "queued");

    await service.delete("missing");
    assert.deepEqual(db.getDownloadStatus("missing"), {
      episodeId: "missing",
      progress: 0,
      status: "missing",
    });
  } finally {
    db.close();
  }
});

function seedEpisode(
  db: LocalDatabase,
  audioUrl = "https://cdn.example/episode.mp3",
  episodeId = "episode_1",
): void {
  db.upsertPodcast({
    feedUrl: "https://example.com/feed.xml",
    id: "podcast_1",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Example Feed",
  });
  db.upsertEpisodes([
    {
      audioUrl,
      id: episodeId,
      podcastId: "podcast_1",
      title: `Episode ${episodeId}`,
    },
  ]);
}

test("cancellation removes partial files and a retry can complete", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "rajio-cancel-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  seedEpisode(db);
  const original = globalThis.fetch;
  let begin!: () => void;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          begin();
        },
      }),
      { status: 200 },
    );
  const service = new DownloadService(db, () => path.join(root, "downloads"));
  try {
    const pending = service.start("episode_1");
    await started;
    await service.cancel("episode_1");
    assert.equal((await pending).status, "queued");
    assert.equal(db.getEpisode("episode_1")?.downloadedPath, undefined);
    globalThis.fetch = async () => new Response(new Uint8Array([4, 5, 6]));
    assert.equal((await service.start("episode_1")).status, "downloaded");
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});

test("quota failures and missing files remain recoverable after restart", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "rajio-quota-"));
  const db = new LocalDatabase(path.join(root, "test.sqlite"));
  seedEpisode(db);
  db.setSettings({ downloadLimitBytes: "2" });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
  try {
    const service = new DownloadService(db, () => path.join(root, "downloads"));
    const failure = await service.start("episode_1");
    assert.equal(failure.status, "failed");
    assert.match(failure.error ?? "", /storage limit/);
    db.setSettings({ downloadLimitBytes: "100" });
    const complete = await service.start("episode_1");
    assert.equal(complete.status, "downloaded");
    await import("node:fs/promises").then((fs) => fs.rm(complete.downloadedPath!));
    const restarted = new DownloadService(db, () => path.join(root, "downloads"));
    assert.equal(db.getEpisode("episode_1")?.downloadedPath, undefined);
    assert.equal(restarted.statuses()[0]?.status, "failed");
    assert.equal((await new PlaybackService(db).getSource("episode_1")).isLocal, false);
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
