import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";

import { ipcChannels } from "../shared/ipc";
import { DownloadService } from "./downloads";
import type { LocalDatabase } from "./db";
import { LibraryService } from "./library";
import { PlaybackService } from "./playback";
import { SettingsService } from "./settings";
import { RefreshScheduler } from "./refresh";
import { SyncService } from "./sync";

export function registerIpcHandlers(
  db: LocalDatabase,
  defaultDownloadDirectory: string,
): RefreshScheduler {
  const settings = new SettingsService(db, defaultDownloadDirectory);
  const downloads = new DownloadService(db, () => settings.getDownloadDirectory());
  const library = new LibraryService(db);
  const playback = new PlaybackService(db);
  const sync = new SyncService(db);
  const refresh = new RefreshScheduler(library, (state) => {
    if (!state.running)
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send(ipcChannels.library.changed);
  });
  ipcMain.handle(ipcChannels.library.refreshAll, () => refresh.run(true));
  ipcMain.handle(ipcChannels.library.refreshState, () => refresh.state);

  ipcMain.handle(ipcChannels.library.list, () => library.listPodcasts());
  ipcMain.handle(ipcChannels.library.subscribe, (_event, feedUrl: string) =>
    library.subscribe(feedUrl),
  );
  ipcMain.handle(ipcChannels.library.unsubscribe, (_event, podcastId: string) =>
    library.unsubscribe(podcastId),
  );
  ipcMain.handle(ipcChannels.library.refresh, (_event, podcastId: string) =>
    library.refresh(podcastId),
  );
  ipcMain.handle(ipcChannels.episodes.listAll, () => library.listEpisodes());
  ipcMain.handle(ipcChannels.episodes.listLatest, (_event, request) =>
    library.listLatestEpisodes(request),
  );
  ipcMain.handle(ipcChannels.episodes.listByPodcast, (_event, podcastId: string) =>
    library.listEpisodesByPodcast(podcastId),
  );
  ipcMain.handle(ipcChannels.episodes.listByPodcastPage, (_event, podcastId: string, request) =>
    library.listEpisodesByPodcastPage(podcastId, request),
  );
  ipcMain.handle(ipcChannels.episodes.search, (_event, request) => library.searchEpisodes(request));

  ipcMain.handle(ipcChannels.downloads.start, (_event, episodeId: string) =>
    downloads.start(episodeId),
  );
  ipcMain.handle(ipcChannels.downloads.delete, (_event, episodeId: string) =>
    downloads.delete(episodeId),
  );

  ipcMain.handle(ipcChannels.playback.getSource, (_event, episodeId: string) =>
    playback.getSource(episodeId),
  );
  ipcMain.handle(ipcChannels.playback.listProgress, () => playback.listProgress());
  ipcMain.handle(ipcChannels.playback.saveProgress, (_event, progress) =>
    playback.saveProgress(progress),
  );

  ipcMain.handle(ipcChannels.settings.chooseDownloadDirectory, async (event) => {
    const options: OpenDialogOptions = {
      buttonLabel: "Choose",
      defaultPath: settings.getDownloadDirectory(),
      properties: ["openDirectory", "createDirectory"],
      title: "Choose Download Folder",
    };
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);
    const downloadDirectory = result.filePaths[0];

    if (result.canceled || !downloadDirectory) {
      return null;
    }

    return settings.setDownloadDirectory(downloadDirectory);
  });
  ipcMain.handle(ipcChannels.settings.get, () => settings.get());
  ipcMain.handle(ipcChannels.settings.set, (_event, nextSettings) => settings.set(nextSettings));

  ipcMain.handle(ipcChannels.sync.now, () => sync.syncNow());
  return refresh;
}
