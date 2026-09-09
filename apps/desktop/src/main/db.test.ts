import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalDatabase } from "./db";

test("stores podcasts and episodes in SQLite", () => {
  const db = createTestDatabase();

  db.upsertPodcast({
    description: "A feed",
    feedUrl: "https://example.com/feed.xml",
    id: "podcast_1",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Example Feed",
  });
  db.upsertEpisodes([
    {
      audioUrl: "https://example.com/episode.mp3",
      description: "Episode description",
      id: "episode_1",
      podcastId: "podcast_1",
      publishedAt: "2026-01-02T00:00:00.000Z",
      title: "Episode One",
    },
  ]);

  assert.equal(db.listPodcasts()[0]?.title, "Example Feed");
  assert.equal(
    db.listEpisodesByPodcast("podcast_1")[0]?.audioUrl,
    "https://example.com/episode.mp3",
  );
  assert.equal(db.listEpisodes()[0]?.id, "episode_1");

  db.close();
});

test("persists playback progress and sync outbox entries", () => {
  const db = createTestDatabase();

  db.upsertPodcast({
    feedUrl: "https://example.com/feed.xml",
    id: "podcast_1",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Example Feed",
  });
  db.upsertEpisodes([
    {
      audioUrl: "https://example.com/episode.mp3",
      id: "episode_1",
      podcastId: "podcast_1",
      title: "Episode One",
    },
  ]);

  db.savePlaybackProgress({
    currentTime: 42,
    duration: 100,
    episodeId: "episode_1",
    isCompleted: false,
    podcastId: "podcast_1",
  });
  db.appendOutbox("playback.checkpoint", { episodeId: "episode_1" });

  assert.deepEqual(
    db.listOutbox().map((entry) => entry.kind),
    ["playback.checkpoint"],
  );

  db.close();
});

test("pages latest and podcast episodes without loading full feeds", () => {
  const db = createTestDatabase();

  db.upsertPodcast({
    feedUrl: "https://example.com/feed.xml",
    id: "podcast_1",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Example Feed",
  });
  db.upsertPodcast({
    feedUrl: "https://example.com/other.xml",
    id: "podcast_2",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Other Feed",
  });
  db.upsertEpisodes([
    {
      audioUrl: "https://example.com/old.mp3",
      id: "episode_old",
      podcastId: "podcast_1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      title: "Old",
    },
    {
      audioUrl: "https://example.com/new.mp3",
      id: "episode_new",
      podcastId: "podcast_1",
      publishedAt: "2026-01-03T00:00:00.000Z",
      title: "New",
    },
    {
      audioUrl: "https://example.com/other.mp3",
      id: "episode_other",
      podcastId: "podcast_2",
      publishedAt: "2026-01-02T00:00:00.000Z",
      title: "Other",
    },
  ]);

  assert.deepEqual(
    db.listLatestEpisodes({ limit: 2 }).episodes.map((episode) => episode.id),
    ["episode_new", "episode_other"],
  );
  assert.equal(db.listLatestEpisodes({ limit: 2 }).hasMore, true);
  assert.equal(db.listLatestEpisodes({ limit: 2 }).total, 3);
  assert.deepEqual(
    db
      .listEpisodesByPodcastPage("podcast_1", { limit: 1, offset: 1 })
      .episodes.map((episode) => episode.id),
    ["episode_old"],
  );
  assert.equal(db.listEpisodesByPodcastPage("podcast_1", { limit: 1 }).total, 2);

  db.close();
});

test("lists artwork URLs without loading full podcast and episode records", () => {
  const db = createTestDatabase();

  db.upsertPodcast({
    feedUrl: "https://example.com/feed.xml",
    id: "podcast_1",
    imageUrl: "https://cdn.example/show.png",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title: "Example Feed",
  });
  db.upsertEpisodes([
    {
      audioUrl: "https://example.com/old.mp3",
      id: "episode_old",
      imageUrl: "https://cdn.example/old.png",
      podcastId: "podcast_1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      title: "Old",
    },
    {
      audioUrl: "https://example.com/new.mp3",
      id: "episode_new",
      imageUrl: "https://cdn.example/new.png",
      podcastId: "podcast_1",
      publishedAt: "2026-01-02T00:00:00.000Z",
      title: "New",
    },
  ]);

  assert.deepEqual(db.listPodcastArtworkUrls(), ["https://cdn.example/show.png"]);
  assert.deepEqual(db.listEpisodeArtworkUrls(), [
    "https://cdn.example/new.png",
    "https://cdn.example/old.png",
  ]);

  db.close();
});

function createTestDatabase(): LocalDatabase {
  return new LocalDatabase(
    path.join(mkdtempSync(path.join(tmpdir(), "newcastle-")), "test.sqlite"),
  );
}

test("selected episode hydration preserves requested order without returning the library", () => {
  const db = createTestDatabase();
  try {
    db.upsertPodcast({
      id: "selected-show",
      title: "Show",
      feedUrl: "https://example.com/selected.xml",
    });
    db.upsertEpisodes(
      Array.from({ length: 200 }, (_, i) => ({
        id: `selected-${i}`,
        podcastId: "selected-show",
        title: `Episode ${i}`,
        audioUrl: `https://example.com/${i}.mp3`,
      })),
    );
    assert.deepEqual(
      db
        .listEpisodesByIds(["selected-99", "missing", "selected-1", "selected-99"])
        .map((e) => e.id),
      ["selected-99", "selected-1"],
    );
    assert.deepEqual(db.listEpisodesByIds([]), []);
    assert.throws(() => db.listEpisodesByIds(Array(1001).fill("selected-1")), /Invalid/);
    assert.equal(db.listEpisodes().length, 200);
  } finally {
    db.close();
  }
});
