import { t } from "../shared/i18n";
import type { NewcastleApi } from "../shared/ipc";

const missingDesktopServices = () => Promise.reject(new Error(t("Desktop services unavailable.")));

const browserFallbackApi: NewcastleApi = {
  downloads: {
    delete: () => missingDesktopServices(),
    start: () => missingDesktopServices(),
  },
  episodes: {
    listAll: () => Promise.resolve([]),
    listLatest: () => Promise.resolve({ episodes: [], hasMore: false, nextOffset: 0, total: 0 }),
    listByPodcast: () => Promise.resolve([]),
    listByPodcastPage: () =>
      Promise.resolve({ episodes: [], hasMore: false, nextOffset: 0, total: 0 }),
    search: () => Promise.resolve({ episodes: [], hasMore: false, nextOffset: 0, total: 0 }),
  },
  library: {
    list: () => Promise.resolve([]),
    refresh: () => missingDesktopServices(),
    subscribe: () => missingDesktopServices(),
    unsubscribe: () => missingDesktopServices(),
  },
  playback: {
    getSource: () => missingDesktopServices(),
    listProgress: () => Promise.resolve([]),
    saveProgress: () => Promise.resolve(),
  },
  settings: {
    chooseDownloadDirectory: () => Promise.resolve(null),
    get: () => Promise.resolve({}),
    set: () => missingDesktopServices(),
  },
  sync: {
    now: () => missingDesktopServices(),
  },
};

export const desktopApi = window.newcastle ?? browserFallbackApi;
