import { applyLibrary } from "@rajio-app/core-wasm/node";
import type {
  EpisodePage,
  EpisodePageRequest,
  EpisodeSearchRequest,
  EpisodeSummary,
  PodcastSummary,
} from "../shared/types";
import type { LocalDatabase } from "./db";
import { RssService } from "./rss";

interface FeedReader {
  fetchConditional?: RssService["fetchConditional"];
  fetchFeed(feedUrl: string): ReturnType<RssService["fetchFeed"]>;
}

export class LibraryService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly rss: FeedReader = new RssService(),
  ) {}

  async listPodcasts(): Promise<PodcastSummary[]> {
    return this.db.listPodcasts();
  }

  async subscribe(feedUrl: string): Promise<PodcastSummary> {
    const { episodes, podcast } = await this.rss.fetchFeed(feedUrl);
    return this.db.transaction(() => {
      const plan = applyLibrary({
        kind: "subscription",
        feedUrl: podcast.feedUrl,
        existingDate: this.db.getPodcast(podcast.id)?.subscriptionDate,
        fetchedAt: podcast.lastUpdated ?? new Date().toISOString(),
      });
      const saved = { ...podcast, subscriptionDate: plan.subscriptionDate };
      this.db.upsertPodcast(saved);
      this.db.reconcileEpisodes(podcast.id, episodes);
      if (plan.isNew) this.db.appendOutbox("subscription.upsert", { feedUrl: podcast.feedUrl });
      return saved;
    });
  }

  async unsubscribe(podcastId: string): Promise<void> {
    this.db.transaction(() => {
      const podcast = this.db.deletePodcast(podcastId);
      if (podcast) this.db.appendOutbox("subscription.delete", { feedUrl: podcast.feedUrl });
    });
  }

  private refreshing = new Map<string, Promise<PodcastSummary>>();

  refresh(podcastId: string, force = true): Promise<PodcastSummary> {
    const pending = this.refreshing.get(podcastId);
    if (pending) return pending;
    const operation = this.refreshFeed(podcastId, force).finally(() =>
      this.refreshing.delete(podcastId),
    );
    this.refreshing.set(podcastId, operation);
    return operation;
  }

  private async refreshFeed(podcastId: string, force: boolean): Promise<PodcastSummary> {
    const existing = this.db.getPodcast(podcastId);
    if (!existing) throw new Error("Podcast not found");
    const previous = this.db.getFeedHTTP(podcastId);
    if (!force && previous && previous.nextAttempt > Date.now()) {
      if (previous.error) throw new Error(previous.error);
      return existing;
    }
    try {
      const response = this.rss.fetchConditional
        ? await this.rss.fetchConditional(existing.feedUrl, previous ?? {})
        : { feed: await this.rss.fetchFeed(existing.feedUrl) };
      return this.db.transaction(() => {
        const current = this.db.getPodcast(podcastId);
        if (!current) throw new Error("Podcast not found");
        const now = Date.now();
        this.db.saveFeedHTTP(podcastId, {
          etag: response.etag,
          modified: response.modified,
          checkedAt: now,
          nextAttempt: now + 3600_000,
          failures: 0,
        });
        if (!response.feed) return current;
        const { podcast, episodes } = response.feed;
        const plan = applyLibrary({
          kind: "subscription",
          feedUrl: podcast.feedUrl,
          existingDate: current.subscriptionDate,
          fetchedAt: podcast.lastUpdated ?? new Date().toISOString(),
        });
        const refreshedPodcast = { ...podcast, subscriptionDate: plan.subscriptionDate };
        this.db.upsertPodcast(refreshedPodcast);
        this.db.reconcileEpisodes(podcast.id, episodes);
        return refreshedPodcast;
      });
    } catch (error) {
      if (this.db.getPodcast(podcastId)) {
        const failures = (previous?.failures ?? 0) + 1;
        this.db.saveFeedHTTP(podcastId, {
          ...previous,
          checkedAt: Date.now(),
          failures,
          nextAttempt: Date.now() + Math.min(21600_000, 60_000 * 2 ** Math.min(failures, 9)),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  async listEpisodesByPodcast(podcastId: string): Promise<EpisodeSummary[]> {
    return this.db.listEpisodesByPodcast(podcastId);
  }

  async listEpisodesByPodcastPage(
    podcastId: string,
    request?: EpisodePageRequest,
  ): Promise<EpisodePage> {
    return this.db.listEpisodesByPodcastPage(podcastId, request);
  }

  async listLatestEpisodes(request?: EpisodePageRequest): Promise<EpisodePage> {
    return this.db.listLatestEpisodes(request);
  }

  async listEpisodes(): Promise<EpisodeSummary[]> {
    return this.db.listEpisodes();
  }

  async searchEpisodes(request: EpisodeSearchRequest): Promise<EpisodePage> {
    return this.db.searchEpisodes(request);
  }
}
