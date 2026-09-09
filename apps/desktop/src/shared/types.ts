export interface PodcastSummary {
  id: string;
  feedUrl: string;
  title: string;
  author?: string;
  description?: string;
  imageUrl?: string;
  language?: string;
  subscriptionDate?: string;
  lastUpdated?: string;
}

export interface EpisodeSummary {
  id: string;
  podcastId: string;
  guid?: string;
  title: string;
  description?: string;
  content?: string;
  audioUrl: string;
  imageUrl?: string;
  publishedAt?: string;
  duration?: number;
  downloadedPath?: string;
  fileSize?: number;
  downloadedAt?: string;
}

export interface EpisodePageRequest {
  limit?: number;
  offset?: number;
}

export interface EpisodeSearchRequest extends EpisodePageRequest {
  query: string;
}

export interface EpisodePage {
  episodes: EpisodeSummary[];
  hasMore: boolean;
  nextOffset: number;
  total: number;
}

export interface PlaybackProgressInput {
  episodeId: string;
  podcastId: string;
  currentTime: number;
  duration: number;
  isCompleted: boolean;
}

export interface PlaybackProgressSummary extends PlaybackProgressInput {
  lastPlayedAt: string;
}

export interface PlaybackSource {
  episodeId: string;
  source: string;
  isLocal: boolean;
}

export interface DownloadStatus {
  episodeId: string;
  status: "queued" | "downloading" | "downloaded" | "failed" | "missing";
  progress: number;
  error?: string;
  downloadedPath?: string;
}

export interface DesktopSettings {
  keyboardShortcuts?: string;
  language?: string;
  downloadLimitBytes?: string;
  downloadDirectory?: string;
  favoriteEpisodes?: string;
  playbackQueue?: string;
  syncAuthToken?: string;
  syncBaseUrl?: string;
}
