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
      this.db.upsertEpisodes(episodes);
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

  async refresh(podcastId: string): Promise<PodcastSummary> {
    const existing = this.db.getPodcast(podcastId);
    if (!existing) {
      throw new Error("Podcast not found");
    }

    const { episodes, podcast } = await this.rss.fetchFeed(existing.feedUrl);
    return this.db.transaction(() => {
      // A feed removed during the request must not be silently resubscribed.
      const current = this.db.getPodcast(podcastId);
      if (!current) throw new Error("Podcast not found");
      const plan = applyLibrary({
        kind: "subscription",
        feedUrl: podcast.feedUrl,
        existingDate: current.subscriptionDate,
        fetchedAt: podcast.lastUpdated ?? new Date().toISOString(),
      });
      const refreshedPodcast = { ...podcast, subscriptionDate: plan.subscriptionDate };
      this.db.upsertPodcast(refreshedPodcast);
      this.db.upsertEpisodes(episodes);
      return refreshedPodcast;
    });
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
