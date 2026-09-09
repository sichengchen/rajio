import assert from "node:assert/strict";
import test from "node:test";

import { APP_VERSION } from "../shared/version";
import { RssService } from "./rss";

test("parses RSS feeds into podcast and episode records", () => {
  const service = new RssService();
  const result = service.parseFeed(
    "https://example.com/feed.xml",
    `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Example Podcast</title>
        <description><![CDATA[<p>Example description</p>]]></description>
        <itunes:author>Example Author</itunes:author>
        <language>en-us</language>
        <itunes:image href="/art.jpg" />
        <item>
          <title>First Episode</title>
          <guid>episode-guid</guid>
          <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
          <itunes:duration>01:02:03</itunes:duration>
          <itunes:image href="episode-art.jpg" />
          <enclosure url="https://example.com/audio.mp3" type="audio/mpeg" />
        </item>
        <item>
          <title>Transcript Only</title>
          <guid>no-audio</guid>
        </item>
      </channel>
    </rss>`,
  );
  const reparsed = service.parseFeed(
    "https://example.com/feed.xml",
    `<rss version="2.0"><channel><title>Example Podcast</title></channel></rss>`,
  );

  assert.equal(result.podcast.id, reparsed.podcast.id);
  assert.equal(result.podcast.title, "Example Podcast");
  assert.equal(result.podcast.author, "Example Author");
  assert.equal(result.podcast.description, "Example description");
  assert.equal(result.podcast.language, "en-us");
  assert.equal(result.podcast.imageUrl, "https://example.com/art.jpg");
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0]?.title, "First Episode");
  assert.equal(result.episodes[0]?.guid, "episode-guid");
  assert.equal(result.episodes[0]?.publishedAt, "2026-06-01T10:00:00.000Z");
  assert.equal(result.episodes[0]?.duration, 3723);
  assert.equal(result.episodes[0]?.imageUrl, "https://example.com/episode-art.jpg");
  assert.equal(result.episodes[0]?.audioUrl, "https://example.com/audio.mp3");
});

test("uses the feed host when a feed title is missing", () => {
  const result = new RssService().parseFeed(
    "https://podcasts.example/feed.xml",
    `<rss version="2.0"><channel><item><enclosure url="https://cdn.example/audio.mp3" /></item></channel></rss>`,
  );

  assert.equal(result.podcast.title, "podcasts.example");
});

test("rejects empty RSS feed bodies", () => {
  assert.throws(() => new RssService().parseFeed("https://example.com/feed.xml", "  \n "), {
    message: "RSS feed is empty",
  });
});

test("requests feeds with podcast-compatible headers", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: string | undefined;
  let requestedHeaders: HeadersInit | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;

    return new Response(
      `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0"><channel><title>Example Podcast</title></channel></rss>`,
      { status: 200 },
    );
  };

  try {
    await new RssService().fetchFeed("https://example.com/feed.xml");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedUrl, "https://example.com/feed.xml");
  assert.ok(requestedHeaders);
  assert.equal(
    requestedHeaders["Accept" as keyof typeof requestedHeaders],
    "application/rss+xml, application/atom+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.5",
  );
  assert.equal(
    requestedHeaders["Accept-Language" as keyof typeof requestedHeaders],
    "en-US,en;q=0.9",
  );
  assert.equal(
    requestedHeaders["User-Agent" as keyof typeof requestedHeaders],
    `Rajio/${APP_VERSION} (macOS; Podcast RSS Reader)`,
  );
});

test("includes HTTP status text when feed requests fail", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response("", { status: 403, statusText: "Forbidden" });

  try {
    await assert.rejects(
      new RssService().fetchFeed("https://example.com/feed.xml"),
      /Feed request failed with HTTP 403 Forbidden/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects empty fetched feed bodies", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(" ", { status: 200 });

  try {
    await assert.rejects(
      new RssService().fetchFeed("https://example.com/feed.xml"),
      /RSS feed is empty/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conditional feed requests send validators and accept unchanged content", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("if-none-match"), '"v1"');
    assert.equal(headers.get("if-modified-since"), "Tue, 08 Sep 2026 00:00:00 GMT");
    return new Response(null, { status: 304 });
  };
  try {
    const result = await new RssService().fetchConditional("https://example.com/feed", {
      etag: '"v1"',
      modified: "Tue, 08 Sep 2026 00:00:00 GMT",
    });
    assert.equal(result.feed, undefined);
    assert.equal(result.etag, '"v1"');
  } finally {
    globalThis.fetch = original;
  }
});
