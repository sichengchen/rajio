import type {
  DesktopSettings,
  EpisodePage,
  EpisodePageRequest,
  EpisodeSearchRequest,
  DownloadStatus,
  EpisodeSummary,
  PlaybackProgressInput,
  PlaybackProgressSummary,
  PlaybackSource,
  PodcastSummary,
} from "./types";

export const ipcChannels = {
  downloads: {
    delete: "downloads:delete",
    cancel: "downloads:cancel",
    statuses: "downloads:statuses",
    changed: "downloads:changed",
    start: "downloads:start",
  },
  episodes: {
    listAll: "episodes:list-all",
    listLatest: "episodes:list-latest",
    listByPodcast: "episodes:list-by-podcast",
    listByPodcastPage: "episodes:list-by-podcast-page",
    search: "episodes:search",
  },
  library: {
    list: "library:list",
    refreshAll: "library:refresh-all",
    refreshState: "library:refresh-state",
    changed: "library:changed",
    refresh: "library:refresh",
    subscribe: "library:subscribe",
    unsubscribe: "library:unsubscribe",
  },
  playback: {
    getSource: "playback:get-source",
    checkpointRequested: "playback:checkpoint-requested",
    checkpointReady: "playback:checkpoint-ready",
    listProgress: "playback:list-progress",
    saveProgress: "playback:save-progress",
  },
  settings: {
    chooseDownloadDirectory: "settings:choose-download-directory",
    get: "settings:get",
    set: "settings:set",
  },
  sync: {
    now: "sync:now",
  },
} as const;

export interface NewcastleApi {
  controls?: import("./controls").ControlsApi;
  library: {
    refreshAll?: () => Promise<void>;
    refreshState?: () => Promise<{ running: boolean; checkedAt?: string; failures: string[] }>;
    onChanged?: (callback: () => void) => () => void;
    list: () => Promise<PodcastSummary[]>;
    subscribe: (feedUrl: string) => Promise<PodcastSummary>;
    unsubscribe: (podcastId: string) => Promise<void>;
    refresh: (podcastId: string) => Promise<PodcastSummary>;
  };
  episodes: {
    listAll: () => Promise<EpisodeSummary[]>;
    listLatest: (request?: EpisodePageRequest) => Promise<EpisodePage>;
    listByPodcast: (podcastId: string) => Promise<EpisodeSummary[]>;
    listByPodcastPage: (podcastId: string, request?: EpisodePageRequest) => Promise<EpisodePage>;
    search: (request: EpisodeSearchRequest) => Promise<EpisodePage>;
  };
  downloads: {
    cancel?: (episodeId: string) => Promise<void>;
    statuses?: () => Promise<DownloadStatus[]>;
    onChanged?: (callback: (status: DownloadStatus) => void) => () => void;
    start: (episodeId: string) => Promise<DownloadStatus>;
    delete: (episodeId: string) => Promise<void>;
  };
  playback: {
    onCheckpointRequested?: (callback: () => Promise<void>) => () => void;
    getSource: (episodeId: string) => Promise<PlaybackSource>;
    listProgress: () => Promise<PlaybackProgressSummary[]>;
    saveProgress: (progress: PlaybackProgressInput) => Promise<void>;
  };
  settings: {
    chooseDownloadDirectory: () => Promise<string | null>;
    get: () => Promise<DesktopSettings>;
    set: (settings: DesktopSettings) => Promise<DesktopSettings>;
  };
  sync: {
    now: () => Promise<void>;
  };
}
