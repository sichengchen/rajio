import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalDatabase } from "./db";
import { SyncService } from "./sync";
import type { EpisodeSummary, PodcastSummary } from "../shared/types";

test("pulls remote subscriptions and playback checkpoints into local state", async () => {
  const db = createTestDatabase();
  db.setSettings({
    syncAuthToken: "token",
    syncBaseUrl: "https://sync.example",
  });

  const rss = {
    async fetchFeed(feedUrl: string): Promise<{
      episodes: EpisodeSummary[];
      podcast: PodcastSummary;
    }> {
      return {
        episodes: [
          {
            audioUrl: "https://cdn.example/episode.mp3",
            guid: "episode-guid",
            id: "episode_1",
            podcastId: "podcast_1",
            title: "Remote Episode",
          },
        ],
        podcast: {
          feedUrl,
          id: "podcast_1",
          lastUpdated: "2026-01-01T00:00:00.000Z",
          subscriptionDate: "2026-01-01T00:00:00.000Z",
          title: "Remote Podcast",
        },
      };
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://sync.example/api/sync/state");
    return Response.json({
      currentPlayback: null,
      playbackHistory: [
        {
          currentTime: 25,
          duration: 100,
          isCompleted: false,
          lastPlayedAt: "2026-01-02T00:00:00.000Z",
          locator: {
            audioUrl: "https://cdn.example/episode.mp3",
            episodeGuid: "episode-guid",
            feedUrl: "https://example.com/feed.xml",
          },
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      preferences: {
        autoPlay: false,
        itunesSearchEnabled: true,
        skipInterval: 30,
        whatsNewCount: 10,
      },
      subscriptions: [
        {
          deletedAt: null,
          feedUrl: "https://example.com/feed.xml",
          status: "active",
          subscribedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  };

  try {
    await new SyncService(db, rss).syncNow();

    assert.equal(db.listPodcasts()[0]?.title, "Remote Podcast");
    assert.equal(db.listEpisodesByPodcast("podcast_1")[0]?.title, "Remote Episode");
    assert.equal(db.getPlaybackProgress("episode_1")?.currentTime, 25);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("makes no network requests when sync is disabled or settings are incomplete", async () => {
  const db = createTestDatabase();
  db.appendOutbox("subscription.upsert", { feedUrl: "https://example.com/feed.xml" });
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    return Response.json({});
  };

  try {
    await new SyncService(db).syncNow();
    db.setSettings({ syncEnabled: "false", syncAuthToken: "token", syncBaseUrl: "https://sync.example" });
    await new SyncService(db).syncNow();

    assert.equal(requested, false);
    assert.equal(db.listOutbox().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("flushes supported outbox entries before pulling state and keeps unsupported entries", async () => {
  const db = createTestDatabase();
  db.setSettings({
    syncAuthToken: "token",
    syncBaseUrl: "https://sync.example///",
  });
  db.appendOutbox("subscription.upsert", { feedUrl: "https://example.com/feed.xml" });
  db.appendOutbox("collection.queue.v1", ["episode-id"]);
  db.appendOutbox("subscription.delete", { feedUrl: "https://old.example/feed.xml" });
  db.appendOutbox("playback.checkpoint", {
    currentTime: 10,
    duration: 100,
    isCompleted: false,
    lastPlayedAt: "2026-01-01T00:00:00.000Z",
    locator: {
      audioUrl: "https://cdn.example/episode.mp3",
      feedUrl: "https://example.com/feed.xml",
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
      method: init?.method ?? "GET",
      url: String(input),
    });

    if (String(input).endsWith("/api/sync/state")) {
      return Response.json(emptyRemoteState());
    }

    return new Response(null, { status: 204 });
  };

  try {
    await new SyncService(db).syncNow();

    assert.deepEqual(
      requests.map((request) => request.url),
      [
        "https://sync.example/api/sync/subscriptions/upsert",
        "https://sync.example/api/sync/subscriptions/delete",
        "https://sync.example/api/sync/playback/checkpoint",
        "https://sync.example/api/sync/state",
      ],
    );
    assert.equal(requests[0]?.headers.get("Authorization"), "Bearer token");
    assert.equal(requests[0]?.headers.get("Content-Type"), "application/json");
    assert.match(String((requests[2]?.body as { deviceId?: string }).deviceId), /^desktop-/);
    assert.deepEqual(db.listOutbox().map((entry) => entry.kind), ["collection.queue.v1"]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("stops sync on failed outbox flush and leaves remaining entries untouched", async () => {
  const db = createTestDatabase();
  db.setSettings({
    syncAuthToken: "token",
    syncBaseUrl: "https://sync.example",
  });
  db.appendOutbox("subscription.upsert", { feedUrl: "https://example.com/feed.xml" });
  db.appendOutbox("subscription.delete", { feedUrl: "https://old.example/feed.xml" });
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response("nope", { status: 503 });
  };

  try {
    await assert.rejects(new SyncService(db).syncNow(), /Sync request failed with HTTP 503/);

    assert.deepEqual(requestedUrls, ["https://sync.example/api/sync/subscriptions/upsert"]);
    assert.deepEqual(
      db.listOutbox().map((entry) => entry.kind),
      ["subscription.upsert", "subscription.delete"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("fails when pulling remote state receives a non-2xx response", async () => {
  const db = createTestDatabase();
  db.setSettings({
    syncAuthToken: "token",
    syncBaseUrl: "https://sync.example",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("nope", { status: 502 });

  try {
    await assert.rejects(new SyncService(db).syncNow(), /Sync pull failed with HTTP 502/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("applies deleted subscriptions and skips unknown playback checkpoints", async () => {
  const db = createTestDatabase();
  db.setSettings({
    syncAuthToken: "token",
    syncBaseUrl: "https://sync.example",
  });
  seedPodcast(db);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      ...emptyRemoteState(),
      playbackHistory: [
        {
          currentTime: 25,
          duration: 100,
          isCompleted: false,
          lastPlayedAt: "2026-01-02T00:00:00.000Z",
          locator: {
            audioUrl: "https://cdn.example/unknown.mp3",
            feedUrl: "https://example.com/feed.xml",
          },
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      subscriptions: [
        {
          deletedAt: "2026-01-02T00:00:00.000Z",
          feedUrl: "https://example.com/feed.xml",
          status: "deleted",
          subscribedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

  try {
    await new SyncService(db).syncNow();

    assert.equal(db.getPodcast("podcast_1"), null);
    assert.equal(db.getPlaybackProgress("episode_1"), null);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

function createTestDatabase(): LocalDatabase {
  return new LocalDatabase(path.join(mkdtempSync(path.join(tmpdir(), "newcastle-")), "test.sqlite"));
}

function emptyRemoteState() {
  return {
    currentPlayback: null,
    playbackHistory: [],
    preferences: {
      autoPlay: false,
      itunesSearchEnabled: true,
      skipInterval: 30,
      whatsNewCount: 10,
    },
    subscriptions: [],
  };
}

function seedPodcast(db: LocalDatabase): void {
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
      id: "episode_1",
      podcastId: "podcast_1",
      title: "Episode One",
    },
  ]);
}
