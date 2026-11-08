import {
  createSyncLocatorKey,
  type CurrentPlaybackSyncRecord,
  type PlaybackCheckpointSyncRecord,
  type SubscriptionMetadataUpdate,
  type SubscriptionRecord,
  type SyncPreferences,
} from "@rajio-app/contracts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import type { ServerRepositories } from "../../../core/repositories";
import { toMillis } from "../../../core/time";
import {
  currentPlayback,
  playbackCheckpoints,
  schema,
  subscriptions,
  syncPreferences,
} from "./schema";

export type SyncDatabase = DrizzleD1Database<typeof schema>;

export function createSyncDatabase(database: D1Database): SyncDatabase {
  return drizzle(database, { schema });
}

export function createDrizzleServerRepositories(db: SyncDatabase): ServerRepositories {
  return {
    currentPlayback: new DrizzleCurrentPlaybackRepository(db),
    playbackCheckpoints: new DrizzlePlaybackCheckpointRepository(db),
    subscriptions: new DrizzleSubscriptionRepository(db),
    syncPreferences: new DrizzleSyncPreferencesRepository(db),
  };
}

class DrizzleSubscriptionRepository {
  constructor(private readonly db: SyncDatabase) {}

  async list(): Promise<SubscriptionRecord[]> {
    const rows = await this.db.select().from(subscriptions).orderBy(desc(subscriptions.updatedAt));
    return rows.map((row) => ({
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      feedUrl: row.feedUrl,
      metadata: row.metadata,
      status: row.status === "deleted" ? "deleted" : "active",
      subscribedAt: new Date(row.subscribedAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async upsert(record: SubscriptionRecord): Promise<void> {
    await this.db
      .insert(subscriptions)
      .values({
        deletedAt: record.deletedAt ? toMillis(record.deletedAt) : null,
        feedUrl: record.feedUrl,
        status: record.status,
        subscribedAt: toMillis(record.subscribedAt),
        updatedAt: toMillis(record.updatedAt),
      })
      .onConflictDoUpdate({
        set: {
          deletedAt: record.deletedAt ? toMillis(record.deletedAt) : null,
          ...(record.status === "deleted" ? { metadata: null } : {}),
          status: record.status,
          subscribedAt: toMillis(record.subscribedAt),
          updatedAt: toMillis(record.updatedAt),
        },
        target: subscriptions.feedUrl,
      });
  }

  async updateMetadata(updates: SubscriptionMetadataUpdate[]): Promise<void> {
    const [first, ...rest] = updates.map(({ feedUrl, metadata }) =>
      this.db
        .update(subscriptions)
        .set({ metadata })
        .where(and(eq(subscriptions.feedUrl, feedUrl), eq(subscriptions.status, "active"))),
    );
    if (first) await this.db.batch([first, ...rest]);
  }
}

class DrizzlePlaybackCheckpointRepository {
  constructor(private readonly db: SyncDatabase) {}

  async list(): Promise<PlaybackCheckpointSyncRecord[]> {
    const rows = await this.db
      .select()
      .from(playbackCheckpoints)
      .orderBy(desc(playbackCheckpoints.lastPlayedAt));

    return rows.map((row) => ({
      currentTime: row.currentTime,
      duration: row.duration,
      isCompleted: row.isCompleted,
      lastPlayedAt: new Date(row.lastPlayedAt).toISOString(),
      locator: {
        audioUrl: row.audioUrl,
        episodeGuid: row.episodeGuid ?? undefined,
        feedUrl: row.feedUrl,
      },
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async upsert(record: PlaybackCheckpointSyncRecord): Promise<void> {
    const id = createSyncLocatorKey(record.locator);
    await this.db
      .insert(playbackCheckpoints)
      .values({
        audioUrl: record.locator.audioUrl,
        currentTime: record.currentTime,
        duration: record.duration,
        episodeGuid: record.locator.episodeGuid ?? null,
        feedUrl: record.locator.feedUrl,
        id,
        isCompleted: record.isCompleted,
        lastPlayedAt: toMillis(record.lastPlayedAt),
        updatedAt: toMillis(record.updatedAt),
      })
      .onConflictDoUpdate({
        set: {
          audioUrl: record.locator.audioUrl,
          currentTime: record.currentTime,
          duration: record.duration,
          episodeGuid: record.locator.episodeGuid ?? null,
          feedUrl: record.locator.feedUrl,
          isCompleted: record.isCompleted,
          lastPlayedAt: toMillis(record.lastPlayedAt),
          updatedAt: toMillis(record.updatedAt),
        },
        target: playbackCheckpoints.id,
      });
  }
}

class DrizzleCurrentPlaybackRepository {
  constructor(private readonly db: SyncDatabase) {}

  async get(): Promise<CurrentPlaybackSyncRecord | null> {
    const rows = await this.db
      .select()
      .from(currentPlayback)
      .where(eq(currentPlayback.id, 1))
      .limit(1);
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      currentTime: row.currentTime,
      duration: row.duration,
      locator: {
        audioUrl: row.audioUrl,
        episodeGuid: row.episodeGuid ?? undefined,
        feedUrl: row.feedUrl,
      },
      sourceDeviceId: row.sourceDeviceId,
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  async set(record: CurrentPlaybackSyncRecord): Promise<void> {
    await this.db
      .insert(currentPlayback)
      .values({
        audioUrl: record.locator.audioUrl,
        currentTime: record.currentTime,
        duration: record.duration,
        episodeGuid: record.locator.episodeGuid ?? null,
        feedUrl: record.locator.feedUrl,
        id: 1,
        sourceDeviceId: record.sourceDeviceId,
        updatedAt: toMillis(record.updatedAt),
      })
      .onConflictDoUpdate({
        set: {
          audioUrl: record.locator.audioUrl,
          currentTime: record.currentTime,
          duration: record.duration,
          episodeGuid: record.locator.episodeGuid ?? null,
          feedUrl: record.locator.feedUrl,
          sourceDeviceId: record.sourceDeviceId,
          updatedAt: toMillis(record.updatedAt),
        },
        target: currentPlayback.id,
      });
  }

  async clear(): Promise<void> {
    await this.db.delete(currentPlayback).where(eq(currentPlayback.id, 1));
  }
}

class DrizzleSyncPreferencesRepository {
  constructor(private readonly db: SyncDatabase) {}

  async get(): Promise<SyncPreferences | null> {
    const rows = await this.db
      .select()
      .from(syncPreferences)
      .where(eq(syncPreferences.id, 1))
      .limit(1);
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      autoPlay: row.autoPlay,
      itunesSearchEnabled: row.itunesSearchEnabled,
      skipInterval: row.skipInterval,
      updatedAt: new Date(row.updatedAt).toISOString(),
      whatsNewCount: row.whatsNewCount,
    };
  }

  async set(record: SyncPreferences): Promise<void> {
    const normalized = {
      autoPlay: record.autoPlay,
      id: 1,
      itunesSearchEnabled: record.itunesSearchEnabled,
      skipInterval: record.skipInterval,
      updatedAt: toMillis(record.updatedAt ?? new Date().toISOString()),
      whatsNewCount: record.whatsNewCount,
    };

    await this.db.insert(syncPreferences).values(normalized).onConflictDoUpdate({
      set: normalized,
      target: syncPreferences.id,
    });
  }
}
