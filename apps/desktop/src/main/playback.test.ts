import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { LocalDatabase } from "./db";
import { PlaybackService } from "./playback";

test("returns local or remote playback sources and rejects missing episodes", async () => {
  const db = createTestDatabase();
  seedEpisode(db);
  const playback = new PlaybackService(db);

  try {
    assert.deepEqual(await playback.getSource("episode_1"), {
      episodeId: "episode_1",
      isLocal: false,
      source: "https://cdn.example/episode.mp3",
    });

    db.markEpisodeDownloaded("episode_1", "/tmp/downloaded.mp3", 123);
    assert.deepEqual(await playback.getSource("episode_1"), {
      episodeId: "episode_1",
      isLocal: true,
      source: pathToFileURL("/tmp/downloaded.mp3").toString(),
    });

    await assert.rejects(playback.getSource("missing"), /Episode not found/);
  } finally {
    db.close();
  }
});

test("saves playback progress and queues a sync checkpoint locator", async () => {
  const db = createTestDatabase();
  seedEpisode(db);
  const playback = new PlaybackService(db);

  try {
    await playback.saveProgress({
      currentTime: 95,
      duration: 100,
      episodeId: "episode_1",
      isCompleted: true,
      podcastId: "podcast_1",
    });

    assert.deepEqual(db.getPlaybackProgress("episode_1"), {
      currentTime: 95,
      duration: 100,
      episodeId: "episode_1",
      isCompleted: true,
      podcastId: "podcast_1",
    });
    assert.deepEqual(playback.listProgress(), [
      {
        currentTime: 95,
        duration: 100,
        episodeId: "episode_1",
        isCompleted: true,
        lastPlayedAt: playback.listProgress()[0]?.lastPlayedAt,
        podcastId: "podcast_1",
      },
    ]);
    const outbox = db.listOutbox();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.kind, "playback.checkpoint");
    const payload = outbox[0]?.payload as Record<string, unknown>;
    assert.match(String(payload.lastPlayedAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.match(String(payload.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(payload, {
      currentTime: 95,
      duration: 100,
      isCompleted: true,
      lastPlayedAt: payload.lastPlayedAt,
      locator: {
        audioUrl: "https://cdn.example/episode.mp3",
        episodeGuid: "episode-guid",
        feedUrl: "https://example.com/feed.xml",
      },
      updatedAt: payload.updatedAt,
    });
  } finally {
    db.close();
  }
});

test("restores persisted playback progress through a new playback service", async () => {
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "newcastle-")), "test.sqlite");
  const initialDb = new LocalDatabase(dbPath);
  seedEpisode(initialDb);

  await new PlaybackService(initialDb).saveProgress({
    currentTime: 100,
    duration: 100,
    episodeId: "episode_1",
    isCompleted: true,
    podcastId: "podcast_1",
  });
  initialDb.close();

  const restoredDb = new LocalDatabase(dbPath);
  try {
    const [progress] = new PlaybackService(restoredDb).listProgress();

    assert.equal(progress?.episodeId, "episode_1");
    assert.equal(progress?.currentTime, 100);
    assert.equal(progress?.isCompleted, true);
    assert.match(progress?.lastPlayedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    restoredDb.close();
  }
});

test("does not queue progress sync when the episode or podcast is missing", async () => {
  const db = createTestDatabase();
  seedEpisode(db);
  const playback = new PlaybackService(db);

  try {
    await assert.rejects(
      playback.saveProgress({
        currentTime: 1,
        duration: 10,
        episodeId: "missing",
        isCompleted: false,
        podcastId: "podcast_1",
      }),
      /Episode not found/,
    );
    assert.equal(db.listOutbox().length, 0);
  } finally {
    db.close();
  }
});

function createTestDatabase(): LocalDatabase {
  return new LocalDatabase(
    path.join(mkdtempSync(path.join(tmpdir(), "newcastle-")), "test.sqlite"),
  );
}

function seedEpisode(db: LocalDatabase): void {
  db.upsertPodcast({
    feedUrl: "https://example.com/feed.xml",
    id: "podcast_1",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Example Feed",
  });
  db.upsertEpisodes([
    {
      audioUrl: "https://cdn.example/episode.mp3",
      guid: "episode-guid",
      id: "episode_1",
      podcastId: "podcast_1",
      title: "Episode One",
    },
  ]);
}

test("invalid progress and failed outbox writes leave the previous checkpoint intact", async () => {
  const db = createTestDatabase();
  seedEpisode(db);
  const playback = new PlaybackService(db);
  const progress = {
    episodeId: "episode_1",
    podcastId: "podcast_1",
    currentTime: 10,
    duration: 100,
    isCompleted: false,
  };
  try {
    await playback.saveProgress(progress);
    await assert.rejects(
      playback.saveProgress({ ...progress, currentTime: -1 }),
      /Invalid playback/,
    );
    db.appendOutbox = () => {
      throw new Error("Injected outbox failure");
    };
    await assert.rejects(playback.saveProgress({ ...progress, currentTime: 20 }), /Injected/);
    assert.equal(db.getPlaybackProgress("episode_1")?.currentTime, 10);
    assert.equal(db.listOutbox().length, 1);
  } finally {
    db.close();
  }
});
