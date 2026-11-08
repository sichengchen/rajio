import type {
  CurrentPlaybackSyncRecord,
  PlaybackCheckpointSyncRecord,
  SubscriptionRecord,
  SubscriptionMetadataUpdate,
  SyncPreferences,
} from "@rajio-app/contracts";

export interface SubscriptionRepository {
  list(): Promise<SubscriptionRecord[]>;
  upsert(record: SubscriptionRecord): Promise<void>;
  updateMetadata(updates: SubscriptionMetadataUpdate[]): Promise<void>;
}

export interface PlaybackCheckpointRepository {
  list(): Promise<PlaybackCheckpointSyncRecord[]>;
  upsert(record: PlaybackCheckpointSyncRecord): Promise<void>;
}

export interface CurrentPlaybackRepository {
  get(): Promise<CurrentPlaybackSyncRecord | null>;
  set(record: CurrentPlaybackSyncRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface SyncPreferencesRepository {
  get(): Promise<SyncPreferences | null>;
  set(record: SyncPreferences): Promise<void>;
}

export interface ServerRepositories {
  subscriptions: SubscriptionRepository;
  playbackCheckpoints: PlaybackCheckpointRepository;
  currentPlayback: CurrentPlaybackRepository;
  syncPreferences: SyncPreferencesRepository;
}
