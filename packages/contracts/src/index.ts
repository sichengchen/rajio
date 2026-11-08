export const SYNC_PROTOCOL_VERSION = "1";
export const DEFAULT_SYNC_PREFERENCES = {
  autoPlay: false,
  itunesSearchEnabled: true,
  skipInterval: 30,
  whatsNewCount: 10,
} as const;

export type ISODateString = string;

export interface SyncEpisodeLocator {
  feedUrl: string;
  episodeGuid?: string;
  audioUrl: string;
}

export interface SubscriptionRecord {
  feedUrl: string;
  status: "active" | "deleted";
  subscribedAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  metadata?: PodcastMetadata | null;
}

export interface PodcastMetadata {
  title: string;
  author?: string;
  description?: string;
  imageUrl?: string;
  language?: string;
}

export interface SubscribedPodcast extends Partial<PodcastMetadata> {
  feedUrl: string;
  subscribedAt: ISODateString;
}

export interface SubscriptionMetadataUpdate {
  feedUrl: string;
  metadata: PodcastMetadata;
}

export const SUBSCRIPTION_METADATA_BATCH_SIZE = 25;

export function normalizePodcastMetadata(metadata: PodcastMetadata): PodcastMetadata {
  return {
    title: metadata.title.trim().slice(0, 512),
    author: metadata.author?.trim().slice(0, 512) || undefined,
    description: metadata.description?.trim().slice(0, 4000) || undefined,
    imageUrl: metadata.imageUrl?.trim().slice(0, 2048) || undefined,
    language: metadata.language?.trim().slice(0, 64) || undefined,
  };
}

export interface PlaybackCheckpointSyncRecord {
  locator: SyncEpisodeLocator;
  currentTime: number;
  duration: number;
  isCompleted: boolean;
  lastPlayedAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CurrentPlaybackSyncRecord {
  locator: SyncEpisodeLocator;
  currentTime: number;
  duration: number;
  sourceDeviceId: string;
  updatedAt: ISODateString;
}

export interface SyncPreferences {
  skipInterval: number;
  autoPlay: boolean;
  whatsNewCount: number;
  itunesSearchEnabled: boolean;
  updatedAt?: ISODateString;
}

export interface SyncStateResponse {
  subscriptions: SubscriptionRecord[];
  playbackHistory: PlaybackCheckpointSyncRecord[];
  currentPlayback: CurrentPlaybackSyncRecord | null;
  preferences: SyncPreferences;
}

export interface BootstrapSyncRequest {
  deviceId: string;
  subscriptions: SubscriptionRecord[];
  playbackHistory: PlaybackCheckpointSyncRecord[];
  currentPlayback: CurrentPlaybackSyncRecord | null;
  preferences: SyncPreferences;
}

export interface ServerMetaResponse {
  appVersion: string;
  protocolVersion: string;
  realtime: boolean;
  deploymentHint?: string;
}

export interface RealtimeTicketResponse {
  ticket: string;
  expiresAt: ISODateString;
  wsUrl: string;
}

export interface SubscriptionMutationRequest {
  feedUrl: string;
}

export interface PlaybackCheckpointRequest {
  deviceId: string;
  checkpoint: PlaybackCheckpointSyncRecord;
}

export interface ClearCurrentPlaybackRequest {
  deviceId: string;
}

export interface UpdatePreferencesRequest {
  preferences: SyncPreferences;
}

export interface RealtimeTicketRequest {
  deviceId: string;
}

export interface PlaybackRealtimeEvent {
  type: "playback.updated" | "playback.cleared";
  currentPlayback: CurrentPlaybackSyncRecord | null;
  checkpoint?: PlaybackCheckpointSyncRecord | null;
}

export function createSyncLocatorKey(locator: SyncEpisodeLocator): string {
  return [locator.feedUrl, locator.episodeGuid ?? "", locator.audioUrl].join("::");
}

export function normalizeBackendUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}
