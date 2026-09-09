import { contextBridge, ipcRenderer } from "electron";

import { ipcChannels, type NewcastleApi } from "../shared/ipc";

const api: NewcastleApi = {
  downloads: {
    delete: (episodeId) => ipcRenderer.invoke(ipcChannels.downloads.delete, episodeId),
    start: (episodeId) => ipcRenderer.invoke(ipcChannels.downloads.start, episodeId),
  },
  episodes: {
    listAll: () => ipcRenderer.invoke(ipcChannels.episodes.listAll),
    listLatest: (request) => ipcRenderer.invoke(ipcChannels.episodes.listLatest, request),
    listByPodcast: (podcastId) => ipcRenderer.invoke(ipcChannels.episodes.listByPodcast, podcastId),
    listByPodcastPage: (podcastId, request) =>
      ipcRenderer.invoke(ipcChannels.episodes.listByPodcastPage, podcastId, request),
    search: (request) => ipcRenderer.invoke(ipcChannels.episodes.search, request),
  },
  library: {
    refreshAll: () => ipcRenderer.invoke(ipcChannels.library.refreshAll),
    refreshState: () => ipcRenderer.invoke(ipcChannels.library.refreshState),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on(ipcChannels.library.changed, listener);
      return () => ipcRenderer.removeListener(ipcChannels.library.changed, listener);
    },
    list: () => ipcRenderer.invoke(ipcChannels.library.list),
    refresh: (podcastId) => ipcRenderer.invoke(ipcChannels.library.refresh, podcastId),
    subscribe: (feedUrl) => ipcRenderer.invoke(ipcChannels.library.subscribe, feedUrl),
    unsubscribe: (podcastId) => ipcRenderer.invoke(ipcChannels.library.unsubscribe, podcastId),
  },
  playback: {
    onCheckpointRequested: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, token: string) => {
        void callback()
          .catch((error) => console.error("Final playback checkpoint failed", error))
          .finally(() => ipcRenderer.send(ipcChannels.playback.checkpointReady, token));
      };
      ipcRenderer.on(ipcChannels.playback.checkpointRequested, listener);
      return () => ipcRenderer.removeListener(ipcChannels.playback.checkpointRequested, listener);
    },
    getSource: (episodeId) => ipcRenderer.invoke(ipcChannels.playback.getSource, episodeId),
    listProgress: () => ipcRenderer.invoke(ipcChannels.playback.listProgress),
    saveProgress: (progress) => ipcRenderer.invoke(ipcChannels.playback.saveProgress, progress),
  },
  settings: {
    chooseDownloadDirectory: () => ipcRenderer.invoke(ipcChannels.settings.chooseDownloadDirectory),
    get: () => ipcRenderer.invoke(ipcChannels.settings.get),
    set: (settings) => ipcRenderer.invoke(ipcChannels.settings.set, settings),
  },
  sync: {
    now: () => ipcRenderer.invoke(ipcChannels.sync.now),
  },
};

contextBridge.exposeInMainWorld("newcastle", api);
