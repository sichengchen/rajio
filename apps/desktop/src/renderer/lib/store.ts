import { create } from "zustand";

import { desktopApi } from "@/desktop-api";
import {
  parseFavoriteEpisodes,
  serializeFavoriteEpisodes,
  toggleFavoriteEpisodeId,
} from "@/lib/favorite-episodes";
import { preloadImageUrls } from "@/lib/image-preloader";
import {
  mergePlaybackQueue,
  parsePlaybackQueue,
  putEpisodeFirst,
  putEpisodeNext,
  reorderPlaybackQueue,
  type QueueDropPlacement,
  serializePlaybackQueue,
} from "@/lib/playback-queue";
import type {
  DownloadProgress,
  Episode,
  PlaybackProgress,
  PlaybackState,
  Podcast,
  StorageStats,
  UserPreferences,
} from "@/lib/types";
import type { EpisodeSummary, PodcastSummary } from "../../shared/types";

const defaultPreferences: UserPreferences = {
  autoPlay: false,
  itunesSearchEnabled: true,
  skipInterval: 30,
  theme: "system",
};

const episodeLoadPromises = new Map<string, Promise<Episode[]>>();
const latestEpisodeLoadPromises = new Map<number, Promise<Episode[]>>();
const episodePageLimit = 20;
let playbackQueuePersistence = Promise.resolve();
let favoriteEpisodesPersistence = Promise.resolve();

interface EpisodePageState {
  hasMore: boolean;
  isLoading: boolean;
  loaded: boolean;
  nextOffset: number;
  total: number;
}

const unloadedPageState: EpisodePageState = {
  hasMore: false,
  isLoading: false,
  loaded: false,
  nextOffset: 0,
  total: 0,
};

interface ProgressDialogState {
  currentItem: string;
  isOpen: boolean;
  progress: number;
  title: string;
  total: number;
}

interface PodcastStore {
  currentPage: "podcasts" | "whats-new" | "settings" | "downloaded" | "favorites" | "library";
  downloadedEpisodes: Episode[];
  downloadProgress: Map<string, DownloadProgress>;
  episodeCache: Map<string, Episode[]>;
  episodePageState: Map<string, EpisodePageState>;
  episodesHydrated: boolean;
  episodes: Episode[];
  error: string | null;
  favoriteEpisodes: Episode[];
  isImporting: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  latestEpisodes: Episode[];
  latestEpisodesPage: EpisodePageState;
  latestEpisodesVersion: number;
  libraryEpisodes: Episode[];
  playbackProgress: Map<string, PlaybackProgress>;
  playbackQueue: Episode[];
  playbackState: PlaybackState;
  podcasts: Podcast[];
  preferences: UserPreferences;
  progressDialog: ProgressDialogState;
  selectedPodcastId: string | null;
  showAddPodcastDialog: boolean;
  showNotesOpen: boolean;
  storageStats: StorageStats | null;
  queueOpen: boolean;

  addToQueue: (episode: Episode) => void;
  cancelDownload: (episodeId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  clearError: () => void;
  clearLatestEpisodesCache: () => void;
  clearPlayback: () => void;
  clearQueue: () => void;
  clearSeekRequest: () => void;
  closeProgressDialog: () => void;
  deleteDownload: (episodeId: string) => Promise<void>;
  downloadEpisode: (episode: Episode) => Promise<void>;
  getDownloadedEpisodes: () => Promise<Episode[]>;
  getEpisode: (episodeId: string) => Promise<Episode | null>;
  getLatestEpisodes: () => Promise<Episode[]>;
  getUnfinishedEpisodes: () => Promise<Episode[]>;
  importFromOPML: (opmlContent: string) => Promise<{ errors: number; imported: number }>;
  initializeStore: (background?: boolean) => Promise<void>;
  loadEpisodes: (podcastId: string) => Promise<void>;
  loadMoreEpisodes: (podcastId: string) => Promise<void>;
  loadMoreLatestEpisodes: () => Promise<Episode[]>;
  pausePlayback: () => void;
  playEpisode: (episode: Episode) => void;
  playNextEpisode: () => boolean;
  playQueuedEpisode: (episodeId: string) => void;
  refreshAllPodcasts: () => Promise<void>;
  refreshPodcast: (podcastId: string) => Promise<void>;
  refreshStorageStats: () => Promise<void>;
  resumePlayback: () => void;
  removeFromQueue: (episodeId: string) => void;
  reorderQueue: (
    sourceEpisodeId: string,
    targetEpisodeId: string,
    placement: QueueDropPlacement,
  ) => void;
  retryDownload: (episode: Episode) => Promise<void>;
  saveProgress: (
    episodeId: string,
    currentTime: number,
    duration: number,
    isCompleted?: boolean,
  ) => Promise<void>;
  seekToTime: (time: number) => void;
  setAutoPlay: (autoPlay: boolean) => void;
  setCurrentPage: (
    page: "podcasts" | "whats-new" | "settings" | "downloaded" | "favorites" | "library",
  ) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setError: (error: string | null) => void;
  setItunesSearchEnabled: (enabled: boolean) => void;
  setEpisodeListened: (episode: Episode, listened: boolean) => Promise<void>;
  setLoading: (isLoading: boolean) => void;
  setProgressDialog: (data: Partial<ProgressDialogState> & { isOpen: boolean }) => void;
  setSelectedPodcast: (podcastId: string | null) => void;
  setShowAddPodcastDialog: (show: boolean) => void;
  setSkipInterval: (interval: number) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setVolume: (volume: number) => void;
  subscribeToPodcast: (feedUrl: string) => Promise<void>;
  toggleShowNotes: () => void;
  toggleQueue: () => void;
  toggleFavoriteEpisode: (episode: Episode) => void;
  unsubscribeFromPodcast: (podcastId: string) => Promise<void>;
  updateDownloadProgress: (episodeId: string, progress: DownloadProgress) => void;
  updateProgress: (progress: number, currentItem?: string) => void;
}

type StoreSet = (
  partial: Partial<PodcastStore> | ((state: PodcastStore) => Partial<PodcastStore>),
) => void;

export const usePodcastStore = create<PodcastStore>((set, get) => ({
  currentPage: "whats-new",
  downloadedEpisodes: [],
  downloadProgress: new Map(),
  episodeCache: new Map(),
  episodePageState: new Map(),
  episodesHydrated: false,
  episodes: [],
  error: null,
  favoriteEpisodes: [],
  isImporting: false,
  isLoading: false,
  isRefreshing: false,
  latestEpisodes: [],
  latestEpisodesPage: unloadedPageState,
  latestEpisodesVersion: 0,
  libraryEpisodes: [],
  playbackProgress: new Map(),
  playbackQueue: [],
  playbackState: {
    currentEpisode: null,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    isPlaying: false,
    seekRequested: false,
    showNotes: "",
    volume: 1,
  },
  podcasts: [],
  preferences: defaultPreferences,
  progressDialog: {
    currentItem: "",
    isOpen: false,
    progress: 0,
    title: "",
    total: 0,
  },
  selectedPodcastId: null,
  showAddPodcastDialog: false,
  showNotesOpen: false,
  storageStats: null,
  queueOpen: false,

  addToQueue: (episode) => {
    const state = get();
    if (!state.playbackState.currentEpisode) {
      state.playEpisode(episode);
      return;
    }

    if (state.playbackState.currentEpisode.id === episode.id) {
      return;
    }

    const currentEpisode = state.playbackState.currentEpisode;
    const episodeIds = putEpisodeNext(
      putEpisodeFirst(
        state.playbackQueue.map((queuedEpisode) => queuedEpisode.id),
        currentEpisode.id,
      ),
      episode.id,
      currentEpisode.id,
    );
    const episodesById = new Map([
      ...state.playbackQueue.map((queuedEpisode) => [queuedEpisode.id, queuedEpisode] as const),
      [currentEpisode.id, currentEpisode] as const,
      [episode.id, episode] as const,
    ]);
    const playbackQueue = episodeIds.flatMap((episodeId) => {
      const queuedEpisode = episodesById.get(episodeId);
      return queuedEpisode ? [queuedEpisode] : [];
    });

    set({ playbackQueue });
    persistPlaybackQueue(playbackQueue);
  },

  cancelDownload: async (episodeId) => {
    const next = new Map(get().downloadProgress);
    next.delete(episodeId);
    set({ downloadProgress: next });
  },

  clearAllData: async () => {
    for (const podcast of get().podcasts) {
      await desktopApi.library.unsubscribe(podcast.id);
    }
    set({
      downloadedEpisodes: [],
      downloadProgress: new Map(),
      episodeCache: new Map(),
      episodePageState: new Map(),
      episodesHydrated: true,
      episodes: [],
      favoriteEpisodes: [],
      latestEpisodes: [],
      latestEpisodesPage: unloadedPageState,
      latestEpisodesVersion: get().latestEpisodesVersion + 1,
      libraryEpisodes: [],
      playbackProgress: new Map(),
      playbackQueue: [],
      podcasts: [],
      queueOpen: false,
      selectedPodcastId: null,
    });
    persistPlaybackQueue([]);
    persistFavoriteEpisodes([]);
  },

  clearAllDownloads: async () => {
    for (const episode of get().downloadedEpisodes) {
      await desktopApi.downloads.delete(episode.id);
    }
    await get().refreshStorageStats();
    await get().getDownloadedEpisodes();
  },

  clearError: () => set({ error: null }),

  clearLatestEpisodesCache: () =>
    set((state) => ({
      latestEpisodes: [],
      latestEpisodesPage: unloadedPageState,
      latestEpisodesVersion: state.latestEpisodesVersion + 1,
    })),

  clearPlayback: () =>
    set((state) => ({
      playbackState: {
        ...state.playbackState,
        currentEpisode: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        showNotes: "",
      },
    })),

  clearQueue: () => {
    const currentEpisode = get().playbackState.currentEpisode;
    const playbackQueue = currentEpisode ? [currentEpisode] : [];
    set({ playbackQueue });
    persistPlaybackQueue(playbackQueue);
  },

  clearSeekRequest: () =>
    set((state) => ({
      playbackState: { ...state.playbackState, seekRequested: false },
    })),

  closeProgressDialog: () =>
    set((state) => ({
      progressDialog: { ...state.progressDialog, isOpen: false },
    })),

  deleteDownload: async (episodeId) => {
    await desktopApi.downloads.delete(episodeId);
    set((state) => {
      const downloadProgress = new Map(state.downloadProgress);
      downloadProgress.delete(episodeId);
      return { downloadProgress };
    });
    await reloadSelectedEpisodes(set, get);
    await get().getDownloadedEpisodes();
  },

  downloadEpisode: async (episode) => {
    const progress: DownloadProgress = {
      episodeId: episode.id,
      progress: 0,
      startedAt: new Date(),
      status: "downloading",
    };
    get().updateDownloadProgress(episode.id, progress);
    try {
      await desktopApi.downloads.start(episode.id);
      get().updateDownloadProgress(episode.id, {
        ...progress,
        completedAt: new Date(),
        progress: 100,
        status: "completed",
      });
      await reloadSelectedEpisodes(set, get);
      await get().getDownloadedEpisodes();
    } catch (error) {
      get().updateDownloadProgress(episode.id, {
        ...progress,
        error: error instanceof Error ? error.message : "Download failed",
        status: "failed",
      });
      throw error;
    }
  },

  getDownloadedEpisodes: async () => {
    const episodes = await loadEpisodesFromLibrary(set, get);
    const downloadedEpisodes = episodes.filter((episode) => episode.isDownloaded);
    set({ downloadedEpisodes });
    return downloadedEpisodes;
  },

  getEpisode: async (episodeId) => {
    const cachedEpisode = findEpisode(episodeId, get());
    if (cachedEpisode) {
      return cachedEpisode;
    }

    const episodes = await loadEpisodesFromLibrary(set, get);
    return episodes.find((episode) => episode.id === episodeId) ?? null;
  },

  getLatestEpisodes: async () => {
    const page = get().latestEpisodesPage;
    if (page.loaded) {
      return get().latestEpisodes;
    }

    set({ latestEpisodesPage: { ...page, isLoading: true } });
    try {
      await loadLatestEpisodePage(set, get, 0);
      return get().latestEpisodes;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load latest episodes.",
        latestEpisodesPage: { ...get().latestEpisodesPage, isLoading: false },
      });
      return get().latestEpisodes;
    }
  },

  getUnfinishedEpisodes: async () => {
    const progress = get().playbackProgress;
    const episodes = await loadEpisodesFromLibrary(set, get);
    return episodes.filter((episode) => {
      const entry = progress.get(episode.id);
      return entry && entry.currentTime > 0 && !entry.isCompleted;
    });
  },

  importFromOPML: async (opmlContent) => {
    set({ isImporting: true });
    const feeds = extractOpmlFeeds(opmlContent);
    const { closeProgressDialog, setProgressDialog, updateProgress } = get();

    if (feeds.length === 0) {
      set({ isImporting: false });
      throw new Error("No podcast feeds found in OPML file");
    }

    setProgressDialog({
      currentItem: "Preparing import...",
      isOpen: true,
      progress: 0,
      title: "Importing OPML Subscriptions",
      total: feeds.length,
    });

    let imported = 0;
    let errors = 0;

    try {
      for (const [index, feed] of feeds.entries()) {
        updateProgress(index + 1, feed.title);

        try {
          const existing = get().podcasts.find((podcast) => podcast.feedUrl === feed.feedUrl);
          if (existing) {
            continue;
          }

          await desktopApi.library.subscribe(feed.feedUrl);
          imported += 1;
        } catch (error) {
          console.error(`Failed to import podcast: ${feed.feedUrl}`, error);
          errors += 1;
        }
      }

      await get().initializeStore();
      return { errors, imported };
    } finally {
      closeProgressDialog();
      set({ isImporting: false });
    }
  },

  initializeStore: async (background = false) => {
    if (!background) set({ isLoading: true });
    try {
      await Promise.all([favoriteEpisodesPersistence, playbackQueuePersistence]);
      const [podcastSummaries, settings, progressSummaries] = await Promise.all([
        desktopApi.library.list(),
        desktopApi.settings.get(),
        desktopApi.playback.listProgress(),
      ]);
      const podcasts = podcastSummaries.map(toPodcast);
      const favoriteEpisodeIds = parseFavoriteEpisodes(settings.favoriteEpisodes);
      const resumableEpisodeIds = progressSummaries
        .filter((progress) => progress.currentTime > 0 && !progress.isCompleted)
        .map((progress) => progress.episodeId);
      const queueEpisodeIds = mergePlaybackQueue(
        parsePlaybackQueue(settings.playbackQueue),
        resumableEpisodeIds,
      );
      const libraryEpisodes =
        favoriteEpisodeIds.length > 0 || queueEpisodeIds.length > 0
          ? await listLibraryEpisodes(podcasts)
          : null;
      const episodesById = new Map(
        (libraryEpisodes ?? []).map((episode) => [episode.id, episode] as const),
      );
      const playbackQueue = queueEpisodeIds.flatMap((episodeId) => {
        const episode = episodesById.get(episodeId);
        return episode ? [episode] : [];
      });
      const favoriteEpisodes = favoriteEpisodeIds.flatMap((episodeId) => {
        const episode = episodesById.get(episodeId);
        return episode ? [episode] : [];
      });
      const selectedPodcastId = selectPodcastId(get().selectedPodcastId, podcasts);
      const playbackProgress = new Map(
        progressSummaries.map(
          (progress) =>
            [
              progress.episodeId,
              {
                ...progress,
                id: progress.episodeId,
                lastPlayedAt: new Date(progress.lastPlayedAt),
              },
            ] as const,
        ),
      );
      const currentPlaybackState = get().playbackState;
      const restoredPlaybackState =
        currentPlaybackState.currentEpisode || !playbackQueue[0]
          ? currentPlaybackState
          : {
              ...createPlaybackState(
                currentPlaybackState,
                playbackQueue[0],
                playbackProgress.get(playbackQueue[0].id),
              ),
              isLoading: false,
              isPlaying: false,
            };
      warmPodcastCoverImages(podcasts);

      set({
        downloadedEpisodes: [],
        episodeCache: new Map(),
        episodePageState: new Map(),
        episodesHydrated: libraryEpisodes !== null,
        episodes: [],
        favoriteEpisodes,
        isLoading: false,
        latestEpisodes: [],
        latestEpisodesPage: unloadedPageState,
        latestEpisodesVersion: get().latestEpisodesVersion + 1,
        libraryEpisodes: libraryEpisodes ?? [],
        playbackProgress,
        playbackQueue,
        playbackState: restoredPlaybackState,
        podcasts,
        selectedPodcastId,
        storageStats: null,
      });
      persistPlaybackQueue(playbackQueue);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to initialize library.",
        isLoading: false,
      });
    }
  },

  loadEpisodes: async (podcastId) => {
    const page = get().episodePageState.get(podcastId);
    set({ selectedPodcastId: podcastId });

    if (page?.loaded) {
      set({ episodes: get().episodeCache.get(podcastId) ?? [] });
      return;
    }

    setPodcastPageState(set, get, podcastId, { isLoading: true });
    try {
      await loadPodcastEpisodePage(set, get, podcastId, 0);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load episodes.",
      });
      setPodcastPageState(set, get, podcastId, { isLoading: false });
    }
  },

  loadMoreEpisodes: async (podcastId) => {
    const page = get().episodePageState.get(podcastId);
    if (!page?.loaded) {
      await get().loadEpisodes(podcastId);
      return;
    }

    if (!page.hasMore || page.isLoading) {
      return;
    }

    setPodcastPageState(set, get, podcastId, { isLoading: true });
    try {
      await loadPodcastEpisodePage(set, get, podcastId, page.nextOffset);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load more episodes.",
      });
      setPodcastPageState(set, get, podcastId, { isLoading: false });
    }
  },

  loadMoreLatestEpisodes: async () => {
    const page = get().latestEpisodesPage;
    if (!page.loaded) {
      return get().getLatestEpisodes();
    }

    if (!page.hasMore || page.isLoading) {
      return get().latestEpisodes;
    }

    set({ latestEpisodesPage: { ...page, isLoading: true } });
    try {
      await loadLatestEpisodePage(set, get, page.nextOffset);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load more latest episodes.",
        latestEpisodesPage: { ...get().latestEpisodesPage, isLoading: false },
      });
    }
    return get().latestEpisodes;
  },

  pausePlayback: () => {
    if (!get().playbackState.isPlaying) return;
    set((state) => ({ playbackState: { ...state.playbackState, isPlaying: false } }));
  },

  playEpisode: (episode) => {
    const state = get();
    const episodeIds = putEpisodeFirst(
      state.playbackQueue.map((queuedEpisode) => queuedEpisode.id),
      episode.id,
    );
    const episodesById = new Map([
      ...state.playbackQueue.map((queuedEpisode) => [queuedEpisode.id, queuedEpisode] as const),
      [episode.id, episode] as const,
    ]);
    const playbackQueue = episodeIds.flatMap((episodeId) => {
      const queuedEpisode = episodesById.get(episodeId);
      return queuedEpisode ? [queuedEpisode] : [];
    });

    if (state.playbackState.currentEpisode?.id === episode.id) {
      set({
        playbackQueue,
        playbackState: { ...state.playbackState, isPlaying: true },
      });
      persistPlaybackQueue(playbackQueue);
      return;
    }

    set({
      playbackQueue,
      playbackState: createPlaybackState(
        state.playbackState,
        episode,
        state.playbackProgress.get(episode.id),
      ),
    });
    persistPlaybackQueue(playbackQueue);
  },

  playNextEpisode: () => {
    const state = get();
    const currentEpisodeId = state.playbackState.currentEpisode?.id;
    const currentIndex = currentEpisodeId
      ? state.playbackQueue.findIndex((episode) => episode.id === currentEpisodeId)
      : -1;
    const nextEpisode = state.playbackQueue[currentIndex >= 0 ? currentIndex + 1 : 0];
    if (!nextEpisode) {
      return false;
    }

    const episodeIds = putEpisodeFirst(
      state.playbackQueue.map((episode) => episode.id),
      nextEpisode.id,
    );
    const episodesById = new Map(
      state.playbackQueue.map((episode) => [episode.id, episode] as const),
    );
    const playbackQueue = episodeIds.flatMap((episodeId) => {
      const episode = episodesById.get(episodeId);
      return episode ? [episode] : [];
    });
    set({
      playbackQueue,
      playbackState: createPlaybackState(
        state.playbackState,
        nextEpisode,
        state.playbackProgress.get(nextEpisode.id),
      ),
    });
    persistPlaybackQueue(playbackQueue);
    return true;
  },

  playQueuedEpisode: (episodeId) => {
    const state = get();
    const episode = state.playbackQueue.find((queuedEpisode) => queuedEpisode.id === episodeId);
    if (!episode) {
      return;
    }

    const episodeIds = putEpisodeFirst(
      state.playbackQueue.map((queuedEpisode) => queuedEpisode.id),
      episodeId,
    );
    const episodesById = new Map(
      state.playbackQueue.map((queuedEpisode) => [queuedEpisode.id, queuedEpisode] as const),
    );
    const playbackQueue = episodeIds.flatMap((queuedEpisodeId) => {
      const queuedEpisode = episodesById.get(queuedEpisodeId);
      return queuedEpisode ? [queuedEpisode] : [];
    });
    set({
      playbackQueue,
      playbackState: createPlaybackState(
        state.playbackState,
        episode,
        state.playbackProgress.get(episode.id),
      ),
    });
    persistPlaybackQueue(playbackQueue);
  },

  refreshAllPodcasts: async () => {
    set({ isRefreshing: true });
    try {
      if (desktopApi.library.refreshAll) await desktopApi.library.refreshAll();
      else for (const podcast of get().podcasts) await desktopApi.library.refresh(podcast.id);
      await get().initializeStore();
      get().clearLatestEpisodesCache();
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshPodcast: async (podcastId) => {
    set({ isRefreshing: true });
    try {
      await desktopApi.library.refresh(podcastId);
      set((state) => {
        const episodeCache = new Map(state.episodeCache);
        episodeCache.delete(podcastId);
        return { episodeCache };
      });
      await get().initializeStore();
      await get().loadEpisodes(podcastId);
      get().clearLatestEpisodesCache();
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshStorageStats: async () => {
    const downloadedEpisodes = await get().getDownloadedEpisodes();
    set({
      storageStats: {
        downloadedEpisodes: downloadedEpisodes.length,
        totalSize: downloadedEpisodes.reduce((sum, episode) => sum + (episode.fileSize ?? 0), 0),
      },
    });
  },

  resumePlayback: () => {
    const { playbackState } = get();
    if (!playbackState.currentEpisode || playbackState.isPlaying) return;
    set((state) => ({ playbackState: { ...state.playbackState, isPlaying: true } }));
  },

  removeFromQueue: (episodeId) => {
    if (get().playbackState.currentEpisode?.id === episodeId) {
      return;
    }
    const playbackQueue = get().playbackQueue.filter(
      (queuedEpisode) => queuedEpisode.id !== episodeId,
    );
    set({ playbackQueue });
    persistPlaybackQueue(playbackQueue);
  },

  reorderQueue: (sourceEpisodeId, targetEpisodeId, placement) => {
    const state = get();
    const episodeIds = reorderPlaybackQueue(
      state.playbackQueue.map((episode) => episode.id),
      sourceEpisodeId,
      targetEpisodeId,
      placement,
      state.playbackState.currentEpisode?.id,
    );
    const episodesById = new Map(
      state.playbackQueue.map((episode) => [episode.id, episode] as const),
    );
    const playbackQueue = episodeIds.flatMap((episodeId) => {
      const episode = episodesById.get(episodeId);
      return episode ? [episode] : [];
    });

    set({ playbackQueue });
    persistPlaybackQueue(playbackQueue);
  },

  retryDownload: async (episode) => get().downloadEpisode(episode),

  saveProgress: async (episodeId, currentTime, duration, completedOverride) => {
    const episode = findEpisode(episodeId, get());
    if (!episode) return;
    const existingProgress = get().playbackProgress.get(episodeId);
    const progress: PlaybackProgress = {
      currentTime,
      duration,
      episodeId,
      id: episodeId,
      isCompleted:
        completedOverride ??
        Boolean(existingProgress?.isCompleted || (duration > 0 && currentTime >= duration * 0.95)),
      lastPlayedAt: new Date(),
      podcastId: episode.podcastId,
    };
    await desktopApi.playback.saveProgress(progress);
    set((state) => {
      const playbackProgress = new Map(state.playbackProgress);
      playbackProgress.set(episodeId, progress);
      const playbackQueue =
        completedOverride === true
          ? state.playbackQueue.filter((episode) => episode.id !== episodeId)
          : state.playbackQueue;
      return { playbackProgress, playbackQueue };
    });
    if (completedOverride === true) {
      persistPlaybackQueue(get().playbackQueue);
    }
  },

  seekToTime: (time) =>
    set((state) => ({
      playbackState: { ...state.playbackState, currentTime: time, seekRequested: true },
    })),

  setAutoPlay: (autoPlay) => set((state) => ({ preferences: { ...state.preferences, autoPlay } })),

  setCurrentPage: (currentPage) => set({ currentPage }),

  setCurrentTime: (currentTime) =>
    set((state) => ({ playbackState: { ...state.playbackState, currentTime } })),

  setDuration: (duration) =>
    set((state) => ({ playbackState: { ...state.playbackState, duration } })),

  setError: (error) => set({ error }),

  setItunesSearchEnabled: (itunesSearchEnabled) =>
    set((state) => ({ preferences: { ...state.preferences, itunesSearchEnabled } })),

  setEpisodeListened: async (episode, listened) => {
    const state = get();
    const existingProgress = state.playbackProgress.get(episode.id);
    const currentEpisodeDuration =
      state.playbackState.currentEpisode?.id === episode.id ? state.playbackState.duration : 0;
    const duration = existingProgress?.duration || episode.duration || currentEpisodeDuration || 0;
    await state.saveProgress(episode.id, listened ? duration : 0, duration, listened);
  },

  setLoading: (isLoading) => {
    if (get().playbackState.isLoading === isLoading) return;
    set((state) => ({ playbackState: { ...state.playbackState, isLoading } }));
  },

  setProgressDialog: (data) =>
    set((state) => ({ progressDialog: { ...state.progressDialog, ...data } })),

  setSelectedPodcast: (selectedPodcastId) => {
    if (get().selectedPodcastId === selectedPodcastId) return;
    const cachedEpisodes = selectedPodcastId
      ? get().episodeCache.get(selectedPodcastId)
      : undefined;
    if (selectedPodcastId) {
      warmSelectedPodcastImages(get().podcasts, selectedPodcastId, cachedEpisodes ?? []);
    }
    set((state) => ({
      episodes: cachedEpisodes ?? state.episodes,
      selectedPodcastId,
    }));
  },

  setShowAddPodcastDialog: (showAddPodcastDialog) => set({ showAddPodcastDialog }),

  setSkipInterval: (skipInterval) =>
    set((state) => ({ preferences: { ...state.preferences, skipInterval } })),

  setTheme: (theme) => set((state) => ({ preferences: { ...state.preferences, theme } })),

  setVolume: (volume) => set((state) => ({ playbackState: { ...state.playbackState, volume } })),

  subscribeToPodcast: async (feedUrl) => {
    set({
      progressDialog: {
        currentItem: "Getting podcast information...",
        isOpen: true,
        progress: 1,
        title: "Adding Podcast",
        total: 3,
      },
    });
    try {
      const podcast = toPodcast(await desktopApi.library.subscribe(feedUrl));
      set((state) => ({
        podcasts: [podcast, ...state.podcasts.filter((entry) => entry.id !== podcast.id)],
        progressDialog: { ...state.progressDialog, isOpen: false },
        selectedPodcastId: podcast.id,
        showAddPodcastDialog: false,
      }));
      await get().loadEpisodes(podcast.id);
      warmSelectedPodcastImages(
        get().podcasts,
        podcast.id,
        get().episodeCache.get(podcast.id) ?? [],
      );
      get().clearLatestEpisodesCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add podcast.";
      set((state) => ({
        error: message,
        progressDialog: { ...state.progressDialog, isOpen: false },
      }));
      throw new Error(message);
    }
  },

  toggleShowNotes: () =>
    set((state) => {
      const showNotesOpen = !state.showNotesOpen;
      return {
        queueOpen: showNotesOpen ? false : state.queueOpen,
        showNotesOpen,
      };
    }),

  toggleQueue: () =>
    set((state) => {
      const queueOpen = !state.queueOpen;
      return {
        queueOpen,
        showNotesOpen: queueOpen ? false : state.showNotesOpen,
      };
    }),

  toggleFavoriteEpisode: (episode) => {
    const state = get();
    const episodeIds = toggleFavoriteEpisodeId(
      state.favoriteEpisodes.map((favoriteEpisode) => favoriteEpisode.id),
      episode.id,
    );
    const episodesById = new Map([
      ...state.favoriteEpisodes.map(
        (favoriteEpisode) => [favoriteEpisode.id, favoriteEpisode] as const,
      ),
      [episode.id, episode] as const,
    ]);
    const favoriteEpisodes = episodeIds.flatMap((episodeId) => {
      const favoriteEpisode = episodesById.get(episodeId);
      return favoriteEpisode ? [favoriteEpisode] : [];
    });

    set({ favoriteEpisodes });
    persistFavoriteEpisodes(favoriteEpisodes);
  },

  unsubscribeFromPodcast: async (podcastId) => {
    await desktopApi.library.unsubscribe(podcastId);
    const previousFavoriteCount = get().favoriteEpisodes.length;
    const previousQueueLength = get().playbackQueue.length;
    set((state) => {
      const podcasts = state.podcasts.filter((podcast) => podcast.id !== podcastId);
      const playbackQueue = state.playbackQueue.filter(
        (episode) => episode.podcastId !== podcastId,
      );
      const favoriteEpisodes = state.favoriteEpisodes.filter(
        (episode) => episode.podcastId !== podcastId,
      );
      const episodeCache = new Map(state.episodeCache);
      const episodePageState = new Map(state.episodePageState);
      const playbackProgress = new Map(state.playbackProgress);
      for (const [episodeId, progress] of playbackProgress) {
        if (progress.podcastId === podcastId) {
          playbackProgress.delete(episodeId);
        }
      }
      episodeCache.delete(podcastId);
      episodePageState.delete(podcastId);
      return {
        episodeCache,
        episodePageState,
        episodes: state.selectedPodcastId === podcastId ? [] : state.episodes,
        favoriteEpisodes,
        playbackQueue,
        playbackProgress,
        podcasts,
        selectedPodcastId:
          state.selectedPodcastId === podcastId
            ? (podcasts[0]?.id ?? null)
            : state.selectedPodcastId,
      };
    });
    if (get().playbackQueue.length !== previousQueueLength) {
      persistPlaybackQueue(get().playbackQueue);
    }
    if (get().favoriteEpisodes.length !== previousFavoriteCount) {
      persistFavoriteEpisodes(get().favoriteEpisodes);
    }
    get().clearLatestEpisodesCache();
  },

  updateDownloadProgress: (episodeId, progress) =>
    set((state) => {
      const downloadProgress = new Map(state.downloadProgress);
      downloadProgress.set(episodeId, progress);
      return { downloadProgress };
    }),

  updateProgress: (progress, currentItem) =>
    set((state) => ({
      progressDialog: {
        ...state.progressDialog,
        currentItem: currentItem ?? state.progressDialog.currentItem,
        progress,
      },
    })),
}));

async function loadPodcastEpisodePage(
  set: StoreSet,
  get: () => PodcastStore,
  podcastId: string,
  offset: number,
) {
  const key = `${podcastId}:${offset}`;
  let loadPromise = episodeLoadPromises.get(key);

  if (!loadPromise) {
    loadPromise = desktopApi.episodes
      .listByPodcastPage(podcastId, { limit: episodePageLimit, offset })
      .then((page) => {
        const incomingEpisodes = page.episodes.map(toEpisode);
        set((state) => {
          const currentEpisodes = offset === 0 ? [] : (state.episodeCache.get(podcastId) ?? []);
          const episodes = mergeEpisodes(currentEpisodes, incomingEpisodes);
          const episodeCache = new Map(state.episodeCache);
          const episodePageState = new Map(state.episodePageState);
          episodeCache.set(podcastId, episodes);
          episodePageState.set(podcastId, {
            hasMore: page.hasMore,
            isLoading: false,
            loaded: true,
            nextOffset: page.nextOffset,
            total: page.total,
          });
          warmSelectedPodcastImages(state.podcasts, podcastId, episodes);

          return {
            episodeCache,
            episodePageState,
            episodes: state.selectedPodcastId === podcastId ? episodes : state.episodes,
          };
        });
        return incomingEpisodes;
      })
      .finally(() => {
        episodeLoadPromises.delete(key);
      });
    episodeLoadPromises.set(key, loadPromise);
  }

  return loadPromise;
}

async function loadLatestEpisodePage(set: StoreSet, get: () => PodcastStore, offset: number) {
  let loadPromise = latestEpisodeLoadPromises.get(offset);

  if (!loadPromise) {
    loadPromise = desktopApi.episodes
      .listLatest({ limit: episodePageLimit, offset })
      .then((page) => {
        const incomingEpisodes = page.episodes.map(toEpisode);
        set((state) => {
          const latestEpisodes = mergeEpisodes(
            offset === 0 ? [] : state.latestEpisodes,
            incomingEpisodes,
          );
          preloadImageUrls(
            latestEpisodes.slice(0, 24).map((episode) => episode.imageUrl),
            {
              immediate: offset === 0,
              limit: 32,
            },
          );

          return {
            latestEpisodes,
            latestEpisodesPage: {
              hasMore: page.hasMore,
              isLoading: false,
              loaded: true,
              nextOffset: page.nextOffset,
              total: page.total,
            },
            latestEpisodesVersion: state.latestEpisodesVersion + 1,
          };
        });
        return incomingEpisodes;
      })
      .finally(() => {
        latestEpisodeLoadPromises.delete(offset);
      });
    latestEpisodeLoadPromises.set(offset, loadPromise);
  }

  return loadPromise;
}

function setPodcastPageState(
  set: StoreSet,
  get: () => PodcastStore,
  podcastId: string,
  patch: Partial<EpisodePageState>,
) {
  const episodePageState = new Map(get().episodePageState);
  episodePageState.set(podcastId, {
    ...(episodePageState.get(podcastId) ?? unloadedPageState),
    ...patch,
  });
  set({ episodePageState });
}

function mergeEpisodes(currentEpisodes: Episode[], incomingEpisodes: Episode[]) {
  const seen = new Set(currentEpisodes.map((episode) => episode.id));
  const merged = [...currentEpisodes];

  for (const episode of incomingEpisodes) {
    if (!seen.has(episode.id)) {
      seen.add(episode.id);
      merged.push(episode);
    }
  }

  return merged;
}

async function reloadSelectedEpisodes(set: StoreSet, get: () => PodcastStore) {
  const selectedPodcastId = get().selectedPodcastId;
  if (selectedPodcastId) {
    const currentCount = get().episodeCache.get(selectedPodcastId)?.length ?? episodePageLimit;
    const page = await desktopApi.episodes.listByPodcastPage(selectedPodcastId, {
      limit: Math.max(currentCount, episodePageLimit),
      offset: 0,
    });
    const episodes = page.episodes.map(toEpisode);
    const episodeCache = new Map(get().episodeCache);
    const episodePageState = new Map(get().episodePageState);
    episodeCache.set(selectedPodcastId, episodes);
    episodePageState.set(selectedPodcastId, {
      hasMore: page.hasMore,
      isLoading: false,
      loaded: true,
      nextOffset: page.nextOffset,
      total: page.total,
    });
    set({
      episodeCache,
      episodePageState,
      episodes,
      latestEpisodes: [],
      latestEpisodesPage: unloadedPageState,
      latestEpisodesVersion: get().latestEpisodesVersion + 1,
    });
  }
}

async function loadEpisodesFromLibrary(set: StoreSet, get: () => PodcastStore) {
  if (get().episodesHydrated) {
    const episodes = get().libraryEpisodes;
    if (episodes.length > 0 || get().podcasts.length === 0) {
      return episodes;
    }
  }

  const episodes = await listLibraryEpisodes(get().podcasts);
  set({
    episodesHydrated: true,
    libraryEpisodes: episodes,
  });
  return episodes;
}

async function listLibraryEpisodes(podcasts: Podcast[]) {
  const listAll = desktopApi.episodes.listAll as (() => Promise<EpisodeSummary[]>) | undefined;

  if (listAll) {
    const episodes = (await listAll()).map(toEpisode);
    if (episodes.length > 0 || podcasts.length === 0) {
      return episodes;
    }
  }

  const episodeGroups = await Promise.all(
    podcasts.map((podcast) => desktopApi.episodes.listByPodcast(podcast.id)),
  );
  return episodeGroups.flat().map(toEpisode);
}

function selectPodcastId(currentPodcastId: string | null, podcasts: Podcast[]) {
  if (currentPodcastId && podcasts.some((podcast) => podcast.id === currentPodcastId)) {
    return currentPodcastId;
  }

  return podcasts[0]?.id ?? null;
}

function warmPodcastCoverImages(podcasts: Podcast[]) {
  preloadImageUrls(
    podcasts.map((podcast) => podcast.imageUrl),
    { limit: 120 },
  );
}

function warmSelectedPodcastImages(podcasts: Podcast[], podcastId: string, episodes: Episode[]) {
  const podcast = podcasts.find((entry) => entry.id === podcastId);
  preloadImageUrls(
    [podcast?.imageUrl, ...episodes.slice(0, 24).map((episode) => episode.imageUrl)],
    {
      immediate: true,
      limit: 32,
    },
  );
}

function findEpisode(episodeId: string, state: PodcastStore) {
  return (
    state.episodes.find((episode) => episode.id === episodeId) ??
    state.latestEpisodes.find((episode) => episode.id === episodeId) ??
    state.libraryEpisodes.find((episode) => episode.id === episodeId) ??
    state.downloadedEpisodes.find((episode) => episode.id === episodeId) ??
    state.favoriteEpisodes.find((episode) => episode.id === episodeId) ??
    state.playbackQueue.find((episode) => episode.id === episodeId) ??
    (state.playbackState.currentEpisode?.id === episodeId
      ? state.playbackState.currentEpisode
      : undefined)
  );
}

function createPlaybackState(
  playbackState: PlaybackState,
  episode: Episode,
  progress?: PlaybackProgress,
): PlaybackState {
  return {
    ...playbackState,
    currentEpisode: episode,
    currentTime: progress?.isCompleted ? 0 : (progress?.currentTime ?? 0),
    duration: progress?.duration || episode.duration || 0,
    isLoading: true,
    isPlaying: true,
    seekRequested: false,
    showNotes: episode.showNotes || episode.content || episode.description,
  };
}

function persistPlaybackQueue(playbackQueue: Episode[]) {
  const playbackQueueSetting = serializePlaybackQueue(playbackQueue.map((episode) => episode.id));

  playbackQueuePersistence = playbackQueuePersistence
    .then(() => desktopApi.settings.set({ playbackQueue: playbackQueueSetting }))
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error("Failed to persist playback queue:", error);
    });
}

function persistFavoriteEpisodes(favoriteEpisodes: Episode[]) {
  const favoriteEpisodesSetting = serializeFavoriteEpisodes(
    favoriteEpisodes.map((episode) => episode.id),
  );

  favoriteEpisodesPersistence = favoriteEpisodesPersistence
    .then(() => desktopApi.settings.set({ favoriteEpisodes: favoriteEpisodesSetting }))
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error("Failed to persist favorite episodes:", error);
    });
}

function toPodcast(podcast: PodcastSummary): Podcast {
  return {
    author: podcast.author,
    categories: [],
    description: podcast.description ?? "",
    feedUrl: podcast.feedUrl,
    id: podcast.id,
    imageUrl: podcast.imageUrl,
    language: podcast.language,
    lastUpdated: toDate(podcast.lastUpdated),
    subscriptionDate: toDate(podcast.subscriptionDate),
    title: podcast.title,
  };
}

function toEpisode(episode: EpisodeSummary): Episode {
  return {
    audioUrl: episode.audioUrl,
    content: episode.content,
    description: episode.description ?? "",
    downloadedAt: episode.downloadedAt ? toDate(episode.downloadedAt) : undefined,
    downloadedPath: episode.downloadedPath,
    duration: episode.duration,
    fileSize: episode.fileSize,
    guid: episode.guid,
    id: episode.id,
    imageUrl: episode.imageUrl,
    isDownloaded: Boolean(episode.downloadedPath),
    podcastId: episode.podcastId,
    publishedAt: toDate(episode.publishedAt),
    showNotes: episode.content,
    title: episode.title,
  };
}

function toDate(value?: string) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function extractOpmlFeeds(opmlContent: string) {
  const document = new DOMParser().parseFromString(opmlContent, "text/xml");
  return Array.from(document.querySelectorAll("outline[xmlUrl]"))
    .map((node) => {
      const feedUrl = node.getAttribute("xmlUrl")?.trim();
      if (!feedUrl) {
        return null;
      }

      return {
        feedUrl,
        title: node.getAttribute("title") ?? node.getAttribute("text") ?? feedUrl,
      };
    })
    .filter((value): value is { feedUrl: string; title: string } => Boolean(value));
}
