import { parseFeed } from "@rajio-app/core-wasm/node";
import type { EpisodeSummary, PodcastSummary } from "../shared/types";
import { APP_VERSION } from "../shared/version";
interface ParsedFeed {
  episodes: EpisodeSummary[];
  podcast: PodcastSummary;
}

const feedRequestHeaders = {
  Accept: [
    "application/rss+xml",
    "application/atom+xml;q=0.9",
    "application/xml;q=0.8",
    "text/xml;q=0.8",
    "*/*;q=0.5",
  ].join(", "),
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": `Rajio/${APP_VERSION} (macOS; Podcast RSS Reader)`,
};

export class RssService {
  async fetchFeed(feedUrl: string): Promise<ParsedFeed> {
    const normalizedFeedUrl = new URL(feedUrl).toString();
    const response = await fetch(normalizedFeedUrl, {
      headers: feedRequestHeaders,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const statusText = response.statusText ? ` ${response.statusText}` : "";
      throw new Error(`Feed request failed with HTTP ${response.status}${statusText}`);
    }

    return this.parseFeed(normalizedFeedUrl, await response.text());
  }

  parseFeed(feedUrl: string, xml: string): ParsedFeed {
    return parseFeed({ feedUrl, xml, fetchedAt: new Date().toISOString() });
  }
}
