import {
  DEFAULT_SYNC_PREFERENCES,
  SUBSCRIPTION_METADATA_BATCH_SIZE,
  createSyncLocatorKey,
  normalizePodcastMetadata,
  type BootstrapSyncRequest,
  type ClearCurrentPlaybackRequest,
  type CurrentPlaybackSyncRecord,
  type PlaybackCheckpointRequest,
  type PlaybackCheckpointSyncRecord,
  type SubscribedPodcast,
  type SubscriptionMetadataUpdate,
  type SyncPreferences,
  type SyncStateResponse,
  type UpdatePreferencesRequest,
} from "@rajio-app/contracts";

import type { ServerRepositories } from "./repositories";
import type { RealtimeCoordinator } from "./realtime";
import { BadRequestError } from "./errors";
import { isoNow, toMillis } from "./time";

export class SyncService {
  constructor(
    private readonly repositories: ServerRepositories,
    private readonly realtimeCoordinator: RealtimeCoordinator,
  ) {}

  async getSubscribedPodcasts(): Promise<SubscribedPodcast[]> {
    const records = await this.repositories.subscriptions.list();
    return records
      .filter((record) => record.status === "active")
      .map(({ feedUrl, metadata, subscribedAt }) => ({ ...metadata, feedUrl, subscribedAt }));
  }

  async updateSubscriptionMetadata(updates: SubscriptionMetadataUpdate[]): Promise<void> {
    if (!Array.isArray(updates) || updates.length > SUBSCRIPTION_METADATA_BATCH_SIZE) {
      throw new BadRequestError(
        `Expected at most ${SUBSCRIPTION_METADATA_BATCH_SIZE} metadata updates`,
      );
    }
    const records = updates.map((update) => {
      const metadata = update?.metadata;
      if (
        typeof update?.feedUrl !== "string" ||
        !update.feedUrl.trim() ||
        typeof metadata?.title !== "string" ||
        !metadata.title.trim() ||
        [metadata.author, metadata.description, metadata.imageUrl, metadata.language].some(
          (value) => value !== undefined && typeof value !== "string",
        )
      ) {
        throw new BadRequestError("Each metadata update needs a feedUrl and podcast title");
      }
      return { feedUrl: update.feedUrl.trim(), metadata: normalizePodcastMetadata(metadata) };
    });
    await this.repositories.subscriptions.updateMetadata(records);
  }

  async getState(): Promise<SyncStateResponse> {
    const [subscriptions, playbackHistory, currentPlayback, preferences] = await Promise.all([
      this.repositories.subscriptions.list(),
      this.repositories.playbackCheckpoints.list(),
      this.repositories.currentPlayback.get(),
      this.repositories.syncPreferences.get(),
    ]);

    return {
      currentPlayback,
      playbackHistory,
      preferences: preferences ?? {
        ...DEFAULT_SYNC_PREFERENCES,
        updatedAt: isoNow(),
      },
      subscriptions,
    };
  }

  async bootstrap(snapshot: BootstrapSyncRequest): Promise<SyncStateResponse> {
    for (const record of snapshot.subscriptions) {
      validateSubscriptionRecord(record);
    }

    for (const checkpoint of snapshot.playbackHistory) {
      validateCheckpointRecord(checkpoint);
    }

    if (snapshot.currentPlayback) {
      validateCurrentPlaybackRecord(snapshot.currentPlayback);
    }

    const [existingSubscriptions, existingPlaybackHistory, existingCurrentPlayback, preferences] =
      await Promise.all([
        this.repositories.subscriptions.list(),
        this.repositories.playbackCheckpoints.list(),
        this.repositories.currentPlayback.get(),
        this.repositories.syncPreferences.get(),
      ]);

    const subscriptionsByFeedUrl = new Map(
      existingSubscriptions.map((record) => [record.feedUrl, record]),
    );
    for (const incoming of snapshot.subscriptions) {
      const existing = subscriptionsByFeedUrl.get(incoming.feedUrl);
      if (!existing || toMillis(incoming.updatedAt) >= toMillis(existing.updatedAt)) {
        await this.repositories.subscriptions.upsert(normalizeSubscriptionRecord(incoming));
      }
    }

    const checkpointsById = new Map(
      existingPlaybackHistory.map((record) => [createSyncLocatorKey(record.locator), record]),
    );
    for (const incoming of snapshot.playbackHistory) {
      const key = createSyncLocatorKey(incoming.locator);
      const existing = checkpointsById.get(key);
      if (!existing || toMillis(incoming.updatedAt) >= toMillis(existing.updatedAt)) {
        await this.repositories.playbackCheckpoints.upsert(normalizeCheckpointRecord(incoming));
      }
    }

    if (
      snapshot.currentPlayback &&
      (!existingCurrentPlayback ||
        toMillis(snapshot.currentPlayback.updatedAt) >= toMillis(existingCurrentPlayback.updatedAt))
    ) {
      await this.repositories.currentPlayback.set(
        normalizeCurrentPlaybackRecord(snapshot.currentPlayback),
      );
    }

    if (!preferences) {
      await this.repositories.syncPreferences.set(normalizePreferences(snapshot.preferences));
    }

    return this.getState();
  }

  async upsertSubscription(feedUrl: string): Promise<void> {
    if (!feedUrl.trim()) {
      throw new BadRequestError("feedUrl is required");
    }

    const now = isoNow();
    await this.repositories.subscriptions.upsert({
      deletedAt: null,
      feedUrl: feedUrl.trim(),
      status: "active",
      subscribedAt: now,
      updatedAt: now,
    });
  }

  async deleteSubscription(feedUrl: string): Promise<void> {
    if (!feedUrl.trim()) {
      throw new BadRequestError("feedUrl is required");
    }

    const now = isoNow();
    await this.repositories.subscriptions.upsert({
      deletedAt: now,
      feedUrl: feedUrl.trim(),
      status: "deleted",
      subscribedAt: now,
      updatedAt: now,
    });
  }

  async saveCheckpoint(request: PlaybackCheckpointRequest): Promise<void> {
    validateCheckpointRecord(request.checkpoint);
    if (!request.deviceId.trim()) {
      throw new BadRequestError("deviceId is required");
    }

    const now = isoNow();
    const checkpoint: PlaybackCheckpointSyncRecord = {
      ...request.checkpoint,
      currentTime: Math.max(0, request.checkpoint.currentTime),
      duration: Math.max(0, request.checkpoint.duration),
      lastPlayedAt: now,
      updatedAt: now,
    };

    await this.repositories.playbackCheckpoints.upsert(checkpoint);

    if (checkpoint.isCompleted) {
      await this.repositories.currentPlayback.clear();
      await this.realtimeCoordinator.publish({
        checkpoint,
        currentPlayback: null,
        type: "playback.cleared",
      });
      return;
    }

    const currentPlayback: CurrentPlaybackSyncRecord = {
      currentTime: checkpoint.currentTime,
      duration: checkpoint.duration,
      locator: checkpoint.locator,
      sourceDeviceId: request.deviceId.trim(),
      updatedAt: now,
    };

    await this.repositories.currentPlayback.set(currentPlayback);
    await this.realtimeCoordinator.publish({
      checkpoint,
      currentPlayback,
      type: "playback.updated",
    });
  }

  async clearCurrentPlayback(request: ClearCurrentPlaybackRequest): Promise<void> {
    if (!request.deviceId.trim()) {
      throw new BadRequestError("deviceId is required");
    }

    await this.repositories.currentPlayback.clear();
    await this.realtimeCoordinator.publish({
      checkpoint: null,
      currentPlayback: null,
      type: "playback.cleared",
    });
  }

  async updatePreferences(request: UpdatePreferencesRequest): Promise<SyncPreferences> {
    const nextPreferences = normalizePreferences({
      ...request.preferences,
      updatedAt: isoNow(),
    });

    await this.repositories.syncPreferences.set(nextPreferences);
    return nextPreferences;
  }
}

function normalizePreferences(input: SyncPreferences): SyncPreferences {
  return {
    autoPlay: Boolean(input.autoPlay),
    itunesSearchEnabled: input.itunesSearchEnabled ?? DEFAULT_SYNC_PREFERENCES.itunesSearchEnabled,
    skipInterval: Number.isFinite(input.skipInterval)
      ? Math.max(1, Math.floor(input.skipInterval))
      : DEFAULT_SYNC_PREFERENCES.skipInterval,
    updatedAt: input.updatedAt ?? isoNow(),
    whatsNewCount: Number.isFinite(input.whatsNewCount)
      ? Math.max(1, Math.floor(input.whatsNewCount))
      : DEFAULT_SYNC_PREFERENCES.whatsNewCount,
  };
}

function normalizeSubscriptionRecord(record: BootstrapSyncRequest["subscriptions"][number]) {
  return {
    ...record,
    deletedAt: record.status === "deleted" ? (record.deletedAt ?? record.updatedAt) : null,
    feedUrl: record.feedUrl.trim(),
  };
}

function normalizeCheckpointRecord(
  record: PlaybackCheckpointSyncRecord,
): PlaybackCheckpointSyncRecord {
  return {
    ...record,
    currentTime: Math.max(0, record.currentTime),
    duration: Math.max(0, record.duration),
    locator: {
      audioUrl: record.locator.audioUrl.trim(),
      episodeGuid: record.locator.episodeGuid?.trim() || undefined,
      feedUrl: record.locator.feedUrl.trim(),
    },
  };
}

function normalizeCurrentPlaybackRecord(
  record: CurrentPlaybackSyncRecord,
): CurrentPlaybackSyncRecord {
  return {
    ...record,
    currentTime: Math.max(0, record.currentTime),
    duration: Math.max(0, record.duration),
    locator: {
      audioUrl: record.locator.audioUrl.trim(),
      episodeGuid: record.locator.episodeGuid?.trim() || undefined,
      feedUrl: record.locator.feedUrl.trim(),
    },
    sourceDeviceId: record.sourceDeviceId.trim(),
  };
}

function validateSubscriptionRecord(record: BootstrapSyncRequest["subscriptions"][number]): void {
  if (!record.feedUrl.trim()) {
    throw new BadRequestError("Subscription feedUrl is required");
  }
}

function validateCheckpointRecord(record: PlaybackCheckpointSyncRecord): void {
  if (!record.locator.feedUrl.trim() || !record.locator.audioUrl.trim()) {
    throw new BadRequestError("Playback locator feedUrl and audioUrl are required");
  }
}

function validateCurrentPlaybackRecord(record: CurrentPlaybackSyncRecord): void {
  validateCheckpointRecord({
    currentTime: record.currentTime,
    duration: record.duration,
    isCompleted: false,
    lastPlayedAt: record.updatedAt,
    locator: record.locator,
    updatedAt: record.updatedAt,
  });

  if (!record.sourceDeviceId.trim()) {
    throw new BadRequestError("Current playback sourceDeviceId is required");
  }
}
