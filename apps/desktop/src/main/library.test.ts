import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseFeed } from "@rajio-app/core-wasm/node";
import { LocalDatabase } from "./db";
import { LibraryService } from "./library";
import type { EpisodeSummary, PodcastSummary } from "../shared/types";

test("subscribes to a feed, persists records, and queues sync", async () => {
  const db = createTestDatabase();
  const library = new LibraryService(db, feedReader(feed()));

  try {
    const podcast = await library.subscribe("https://example.com/feed.xml");

    assert.equal(podcast.id, "podcast_1");
    assert.equal(db.getPodcast("podcast_1")?.title, "Example Feed");
    assert.equal(db.listEpisodesByPodcast("podcast_1")[0]?.id, "episode_1");
    assert.deepEqual(
      db.listOutbox().map(({ kind, payload }) => ({ kind, payload })),
      [
        {
          kind: "subscription.upsert",
          payload: { feedUrl: "https://example.com/feed.xml" },
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("unsubscribes existing podcasts with cascade cleanup and skips missing podcasts", async () => {
  const db = createTestDatabase();
  seedPodcast(db, "podcast_1", "Example Feed");
  db.savePlaybackProgress({
    currentTime: 20,
    duration: 100,
    episodeId: "episode_1",
    isCompleted: false,
    podcastId: "podcast_1",
  });
  db.saveDownloadStatus({ episodeId: "episode_1", progress: 50, status: "downloading" });
  const library = new LibraryService(db, feedReader(feed()));

  try {
    await library.unsubscribe("missing");
    assert.equal(db.listOutbox().length, 0);

    await library.unsubscribe("podcast_1");

    assert.equal(db.getPodcast("podcast_1"), null);
    assert.equal(db.getEpisode("episode_1"), null);
    assert.equal(db.getPlaybackProgress("episode_1"), null);
    assert.deepEqual(db.getDownloadStatus("episode_1"), {
      episodeId: "episode_1",
      progress: 0,
      status: "missing",
    });
    assert.deepEqual(
      db.listOutbox().map(({ kind, payload }) => ({ kind, payload })),
      [
        {
          kind: "subscription.delete",
          payload: { feedUrl: "https://example.com/feed.xml" },
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("lists podcasts and episodes in stable local ordering", async () => {
  const db = createTestDatabase();
  seedPodcast(db, "podcast_b", "beta", "https://example.com/b.xml", [
    {
      audioUrl: "https://example.com/b-old.mp3",
      id: "episode_b_old",
      podcastId: "podcast_b",
      publishedAt: "2026-01-01T00:00:00.000Z",
      title: "B Old",
    },
    {
      audioUrl: "https://example.com/b-new.mp3",
      id: "episode_b_new",
      podcastId: "podcast_b",
      publishedAt: "2026-01-03T00:00:00.000Z",
      title: "B New",
    },
  ]);
  seedPodcast(db, "podcast_a", "Alpha", "https://example.com/a.xml", [
    {
      audioUrl: "https://example.com/a.mp3",
      id: "episode_a",
      podcastId: "podcast_a",
      publishedAt: "2026-01-02T00:00:00.000Z",
      title: "A",
    },
  ]);
  const library = new LibraryService(db, feedReader(feed()));

  try {
    assert.deepEqual(
      (await library.listPodcasts()).map((podcast) => podcast.title),
      ["Alpha", "beta"],
    );
    assert.deepEqual(
      (await library.listEpisodesByPodcast("podcast_b")).map((episode) => episode.id),
      ["episode_b_new", "episode_b_old"],
    );
    assert.deepEqual(
      (await library.listEpisodes()).map((episode) => episode.id),
      ["episode_a", "episode_b_new", "episode_b_old"],
    );
  } finally {
    db.close();
  }
});

test("searches episodes with title ranking and bounded paging", async () => {
  const db = createTestDatabase();
  seedPodcast(db, "podcast_1", "Example Feed", "https://example.com/feed.xml", [
    {
      audioUrl: "https://example.com/exact.mp3",
      content: "No secondary match here",
      id: "episode_exact",
      podcastId: "podcast_1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      title: "Mars",
    },
    {
      audioUrl: "https://example.com/prefix.mp3",
      id: "episode_prefix",
      podcastId: "podcast_1",
      publishedAt: "2026-01-03T00:00:00.000Z",
      title: "Mars Colony",
    },
    {
      audioUrl: "https://example.com/body.mp3",
      content: "A long discussion about Mars exploration",
      id: "episode_body",
      podcastId: "podcast_1",
      publishedAt: "2026-01-04T00:00:00.000Z",
      title: "Space News",
    },
  ]);
  const library = new LibraryService(db, feedReader(feed()));

  try {
    const page = await library.searchEpisodes({ limit: 2, query: "mars" });

    assert.deepEqual(
      page.episodes.map((episode) => episode.id),
      ["episode_exact", "episode_prefix"],
    );
    assert.equal(page.hasMore, true);
    assert.equal(page.nextOffset, 2);
    assert.equal(page.total, 3);
  } finally {
    db.close();
  }
});

test("refresh updates feed content while preserving subscription date and downloaded state", async () => {
  const db = createTestDatabase();
  seedPodcast(db, "podcast_1", "Old Title");
  db.markEpisodeDownloaded("episode_1", "/tmp/downloaded.mp3", 123);
  const library = new LibraryService(
    db,
    feedReader(
      feed({
        episodes: [
          {
            audioUrl: "https://example.com/episode.mp3",
            id: "episode_1",
            podcastId: "podcast_1",
            title: "Updated Episode",
          },
        ],
        podcast: {
          feedUrl: "https://example.com/feed.xml",
          id: "podcast_1",
          lastUpdated: "2026-02-01T00:00:00.000Z",
          subscriptionDate: "2026-02-01T00:00:00.000Z",
          title: "Updated Title",
        },
      }),
    ),
  );

  try {
    const refreshed = await library.refresh("podcast_1");

    assert.equal(refreshed.title, "Updated Title");
    assert.equal(refreshed.subscriptionDate, "2026-01-01T00:00:00.000Z");
    assert.equal(db.getEpisode("episode_1")?.title, "Updated Episode");
    assert.equal(db.getEpisode("episode_1")?.downloadedPath, "/tmp/downloaded.mp3");
  } finally {
    db.close();
  }
});

test("refresh rejects missing podcasts", async () => {
  const db = createTestDatabase();
  const library = new LibraryService(db, feedReader(feed()));

  try {
    await assert.rejects(library.refresh("missing"), /Podcast not found/);
  } finally {
    db.close();
  }
});

function createTestDatabase(): LocalDatabase {
  return new LocalDatabase(
    path.join(mkdtempSync(path.join(tmpdir(), "newcastle-")), "test.sqlite"),
  );
}

function feed(overrides?: { episodes?: EpisodeSummary[]; podcast?: PodcastSummary }): {
  episodes: EpisodeSummary[];
  podcast: PodcastSummary;
} {
  return {
    episodes: overrides?.episodes ?? [
      {
        audioUrl: "https://example.com/episode.mp3",
        id: "episode_1",
        podcastId: "podcast_1",
        publishedAt: "2026-01-02T00:00:00.000Z",
        title: "Episode One",
      },
    ],
    podcast: overrides?.podcast ?? {
      feedUrl: "https://example.com/feed.xml",
      id: "podcast_1",
      lastUpdated: "2026-01-01T00:00:00.000Z",
      subscriptionDate: "2026-01-01T00:00:00.000Z",
      title: "Example Feed",
    },
  };
}

function feedReader(result: { episodes: EpisodeSummary[]; podcast: PodcastSummary }) {
  return {
    async fetchFeed() {
      return result;
    },
  };
}

function seedPodcast(
  db: LocalDatabase,
  id: string,
  title: string,
  feedUrl = "https://example.com/feed.xml",
  episodes: EpisodeSummary[] = [
    {
      audioUrl: "https://example.com/episode.mp3",
      id: "episode_1",
      podcastId: id,
      publishedAt: "2026-01-02T00:00:00.000Z",
      title: "Episode One",
    },
  ],
): void {
  db.upsertPodcast({
    feedUrl,
    id,
    lastUpdated: "2026-01-01T00:00:00.000Z",
    subscriptionDate: "2026-01-01T00:00:00.000Z",
    title,
  });
  db.upsertEpisodes(episodes);
}

test("outbox failure rolls back subscribe and unsubscribe, including cascaded rows", async () => {
  const db = createTestDatabase();
  const library = new LibraryService(db, feedReader(feed()));
  const append = db.appendOutbox.bind(db);
  db.appendOutbox = () => {
    throw new Error("Injected outbox failure");
  };
  try {
    await assert.rejects(library.subscribe("https://example.com/feed.xml"), /Injected/);
    assert.equal(db.listPodcasts().length, 0);
    assert.equal(db.listEpisodes().length, 0);
    db.appendOutbox = append;
    await library.subscribe("https://example.com/feed.xml");
    db.appendOutbox = () => {
      throw new Error("Injected outbox failure");
    };
    await assert.rejects(library.unsubscribe("podcast_1"), /Injected/);
    assert.equal(db.listPodcasts().length, 1);
    assert.equal(db.listEpisodes().length, 1);
    assert.equal(db.listOutbox().length, 1);
  } finally {
    db.close();
  }
});

test("duplicate subscriptions preserve the date and do not emit another operation", async () => {
  const db = createTestDatabase();
  const library = new LibraryService(db, feedReader(feed()));
  try {
    await library.subscribe("https://example.com/feed.xml");
    await library.subscribe("https://example.com/feed.xml");
    assert.equal(db.listOutbox().length, 1);
  } finally {
    db.close();
  }
});

test("shared feed fixtures preserve identities and progress across adapter reopen and refresh", async () => {
  const fixtures = new URL("../../../../crates/rajio-core/tests/fixtures/", import.meta.url);
  for (const filename of readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
    const fixture = JSON.parse(readFileSync(new URL(filename, fixtures), "utf8"));
    const parsed = parseFeed(fixture.request);
    const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "rajio-fixture-")), "library.sqlite");
    let db = new LocalDatabase(dbPath);
    await new LibraryService(db, feedReader(parsed)).subscribe(parsed.podcast.feedUrl);
    for (const episode of parsed.episodes)
      db.savePlaybackProgress({
        episodeId: episode.id,
        podcastId: episode.podcastId,
        currentTime: 12,
        duration: 100,
        isCompleted: false,
      });
    db.close();
    db = new LocalDatabase(dbPath);
    try {
      await new LibraryService(db, feedReader(parsed)).refresh(parsed.podcast.id);
      assert.equal(
        db.getPodcast(parsed.podcast.id)?.subscriptionDate,
        fixture.expected.podcast.subscriptionDate,
      );
      assert.deepEqual(
        db
          .listEpisodes()
          .map((e) => e.id)
          .sort(),
        fixture.expected.episodes.map((e: EpisodeSummary) => e.id).sort(),
      );
      for (const episode of parsed.episodes)
        assert.equal(db.getPlaybackProgress(episode.id)?.currentTime, 12);
      assert.equal(db.listOutbox().length, 1);
    } finally {
      db.close();
    }
  }
});

test("feed reorder keeps episode IDs and merges older duplicate checkpoints", async () => {
  const db = createTestDatabase();
  seedPodcast(db, "podcast_1", "Feed");
  db.upsertEpisodes([
    {
      audioUrl: "https://example.com/episode.mp3",
      id: "duplicate",
      podcastId: "podcast_1",
      title: "Duplicate",
    },
  ]);
  db.savePlaybackProgress({
    episodeId: "duplicate",
    podcastId: "podcast_1",
    currentTime: 37,
    duration: 100,
    isCompleted: false,
  });
  const updated = feed({
    episodes: [
      {
        audioUrl: "https://example.com/episode.mp3",
        id: "new-positional-id",
        podcastId: "podcast_1",
        title: "Updated",
      },
    ],
  });
  try {
    await new LibraryService(db, feedReader(updated)).refresh("podcast_1");
    assert.deepEqual(
      db.listEpisodes().map((e) => e.id),
      ["episode_1"],
    );
    assert.equal(db.getPlaybackProgress("episode_1")?.currentTime, 37);
    assert.equal(db.getEpisode("episode_1")?.title, "Updated");
  } finally {
    db.close();
  }
});
