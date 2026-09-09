import { desktopApi } from "@/desktop-api";
import type { DownloadProgress, Episode, StorageStats } from "@/lib/types";

type ProgressCallback = (progress: DownloadProgress) => void;

const callbacks = new Map<string, Set<ProgressCallback>>();
const progressByEpisode = new Map<string, DownloadProgress>();

export class DownloadService {
  static async cancelDownload(episodeId: string) {
    await desktopApi.downloads.cancel?.(episodeId);
    progressByEpisode.delete(episodeId);
    emit(episodeId, undefined);
  }

  static async clearAllDownloads() {
    progressByEpisode.clear();
  }

  static async deleteDownload(episodeId: string) {
    await desktopApi.downloads.delete(episodeId);
    progressByEpisode.delete(episodeId);
    emit(episodeId, undefined);
  }

  static async getDownloadStatus(episodeId: string) {
    return progressByEpisode.get(episodeId) ?? null;
  }

  static async getLocalAudioUrl(episode: Episode) {
    return (await desktopApi.playback.getSource(episode.id)).source;
  }

  static async getStorageStats(): Promise<StorageStats> {
    return {
      downloadedEpisodes: 0,
      totalSize: 0,
    };
  }

  static onProgress(episodeId: string, callback: ProgressCallback) {
    const current = callbacks.get(episodeId) ?? new Set<ProgressCallback>();
    current.add(callback);
    callbacks.set(episodeId, current);
    return () => {
      current.delete(callback);
    };
  }

  static async queueDownload(episode: Episode) {
    const started: DownloadProgress = {
      episodeId: episode.id,
      progress: 0,
      startedAt: new Date(),
      status: "downloading",
    };
    progressByEpisode.set(episode.id, started);
    emit(episode.id, started);
    const result = await desktopApi.downloads.start(episode.id);
    if (result.status === "queued") return;
    if (result.status !== "downloaded") {
      const failed: DownloadProgress = {
        ...started,
        status: "failed",
        error: result.error ?? "Download failed",
      };
      progressByEpisode.set(episode.id, failed);
      emit(episode.id, failed);
      throw new Error(failed.error);
    }
    const completed: DownloadProgress = {
      ...started,
      completedAt: new Date(),
      progress: 100,
      status: "completed",
    };
    progressByEpisode.set(episode.id, completed);
    emit(episode.id, completed);
  }

  static removeProgressCallback(episodeId: string) {
    callbacks.delete(episodeId);
  }

  static async retryDownload(episode: Episode) {
    await DownloadService.queueDownload(episode);
  }

  static setProgressCallback(episodeId: string, callback: ProgressCallback) {
    DownloadService.onProgress(episodeId, callback);
  }
}

function emit(episodeId: string, progress: DownloadProgress | undefined) {
  if (!progress) {
    return;
  }

  for (const callback of callbacks.get(episodeId) ?? []) {
    callback(progress);
  }
}
