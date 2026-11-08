import { normalizeBackendUrl, type SyncStateResponse } from "@rajio-app/contracts";
import { hostname } from "node:os";

import { isSyncEnabled } from "../shared/sync-settings";
import type { LocalDatabase, SyncOutboxEntry } from "./db";
import { RssService } from "./rss";

interface FeedReader {
  fetchFeed(feedUrl: string): ReturnType<RssService["fetchFeed"]>;
}

export class SyncService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly rss: FeedReader = new RssService(),
  ) {}

  async syncNow(): Promise<void> {
    const settings = this.db.getSettings();
    if (!isSyncEnabled(settings) || !settings.syncBaseUrl || !settings.syncAuthToken) {
      return;
    }

    const baseUrl = normalizeBackendUrl(settings.syncBaseUrl);
    for (const entry of this.db.listOutbox()) {
      if (await this.flushEntry(baseUrl, settings.syncAuthToken, entry)) {
        this.db.deleteOutboxEntry(entry.id);
      }
    }

    await this.pullRemoteState(baseUrl, settings.syncAuthToken);
  }

  private async flushEntry(baseUrl: string, token: string, entry: SyncOutboxEntry): Promise<boolean> {
    if (entry.kind === "subscription.upsert") {
      await postJson(`${baseUrl}/api/sync/subscriptions/upsert`, token, entry.payload);
      return true;
    }

    if (entry.kind === "subscription.delete") {
      await postJson(`${baseUrl}/api/sync/subscriptions/delete`, token, entry.payload);
      return true;
    }

    if (entry.kind === "playback.checkpoint") {
      await postJson(`${baseUrl}/api/sync/playback/checkpoint`, token, {
        checkpoint: entry.payload,
        deviceId: getDeviceId(),
      });
      return true;
    }

    return false;
  }

  private async pullRemoteState(baseUrl: string, token: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/sync/state`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Sync pull failed with HTTP ${response.status}`);
    }

    await this.applyRemoteState((await response.json()) as SyncStateResponse);
  }

  private async applyRemoteState(state: SyncStateResponse): Promise<void> {
    for (const subscription of state.subscriptions) {
      if (subscription.status === "deleted") {
        this.db.deletePodcastByFeedUrl(subscription.feedUrl);
        continue;
      }

      if (!this.db.getPodcastByFeedUrl(subscription.feedUrl)) {
        const { episodes, podcast } = await this.rss.fetchFeed(subscription.feedUrl);
        this.db.upsertPodcast({
          ...podcast,
          subscriptionDate: subscription.subscribedAt,
        });
        this.db.upsertEpisodes(episodes);
      }
    }

    for (const checkpoint of state.playbackHistory) {
      const episode = this.db.findEpisodeByLocator(checkpoint.locator);
      const podcast = this.db.getPodcastByFeedUrl(checkpoint.locator.feedUrl);
      if (!episode || !podcast) {
        continue;
      }

      this.db.savePlaybackProgress({
        currentTime: checkpoint.currentTime,
        duration: checkpoint.duration,
        episodeId: episode.id,
        isCompleted: checkpoint.isCompleted,
        podcastId: podcast.id,
      });
    }
  }
}

async function postJson(url: string, token: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Sync request failed with HTTP ${response.status}`);
  }
}

function getDeviceId(): string {
  return `desktop-${hostname()}`;
}
