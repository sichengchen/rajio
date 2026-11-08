import type {
  CurrentPlaybackSyncRecord,
  PlaybackCheckpointSyncRecord,
  PlaybackRealtimeEvent,
  RealtimeTicketResponse,
  SubscriptionRecord,
  SyncPreferences,
} from "@rajio-app/contracts";

import { createApp } from "../adapters/http/create-app";
import type { AuthGuard } from "../core/auth";
import { UnauthorizedError } from "../core/errors";
import type { RealtimeCoordinator } from "../core/realtime";
import type { ServerRepositories } from "../core/repositories";
import { SyncService } from "../core/sync-service";

export class TestAuthGuard implements AuthGuard {
  async authorize(request: Request): Promise<void> {
    if (request.headers.get("Authorization") !== "Bearer test-token") {
      throw new UnauthorizedError();
    }
  }
}

export class TestRealtimeCoordinator implements RealtimeCoordinator {
  readonly publishedEvents: PlaybackRealtimeEvent[] = [];

  async issueTicket(): Promise<RealtimeTicketResponse> {
    return {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ticket: "ticket",
      wsUrl: "ws://example.test/ws/playback?ticket=ticket",
    };
  }

  async connect(): Promise<Response> {
    return new Response("switching", { status: 101 });
  }

  async publish(event: PlaybackRealtimeEvent): Promise<void> {
    this.publishedEvents.push(event);
  }
}

export function createInMemoryRepositories(initial?: {
  currentPlayback?: CurrentPlaybackSyncRecord | null;
  playbackHistory?: PlaybackCheckpointSyncRecord[];
  preferences?: SyncPreferences | null;
  subscriptions?: SubscriptionRecord[];
}): ServerRepositories {
  let subscriptions = [...(initial?.subscriptions ?? [])];
  let playbackHistory = [...(initial?.playbackHistory ?? [])];
  let currentPlayback = initial?.currentPlayback ?? null;
  let preferences = initial?.preferences ?? null;

  return {
    currentPlayback: {
      async clear() {
        currentPlayback = null;
      },
      async get() {
        return currentPlayback;
      },
      async set(record) {
        currentPlayback = record;
      },
    },
    playbackCheckpoints: {
      async list() {
        return [...playbackHistory];
      },
      async upsert(record) {
        playbackHistory = playbackHistory.filter(
          (existing) =>
            existing.locator.audioUrl !== record.locator.audioUrl ||
            existing.locator.feedUrl !== record.locator.feedUrl ||
            existing.locator.episodeGuid !== record.locator.episodeGuid,
        );
        playbackHistory.push(record);
      },
    },
    subscriptions: {
      async list() {
        return [...subscriptions];
      },
      async upsert(record) {
        const existing = subscriptions.find(
          (subscription) => subscription.feedUrl === record.feedUrl,
        );
        subscriptions = subscriptions.filter((existing) => existing.feedUrl !== record.feedUrl);
        subscriptions.push({
          ...record,
          ...(existing?.metadata && record.status === "active"
            ? { metadata: existing.metadata }
            : {}),
        });
      },
      async updateMetadata(updates) {
        const byFeed = new Map(updates.map((update) => [update.feedUrl, update.metadata]));
        subscriptions = subscriptions.map((record) => {
          const metadata = byFeed.get(record.feedUrl);
          return record.status === "active" && metadata ? { ...record, metadata } : record;
        });
      },
    },
    syncPreferences: {
      async get() {
        return preferences;
      },
      async set(record) {
        preferences = record;
      },
    },
  };
}

export function createTestServer(initial?: Parameters<typeof createInMemoryRepositories>[0]) {
  const realtime = new TestRealtimeCoordinator();
  const repositories = createInMemoryRepositories(initial);
  const syncService = new SyncService(repositories, realtime);
  const app = createApp({
    authGuard: new TestAuthGuard(),
    realtimeCoordinator: realtime,
    syncService,
    version: "test",
  });

  return { app, realtime, repositories, syncService };
}
