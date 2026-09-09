import { existsSync } from "node:fs";
import { applyLibrary } from "@rajio-app/core-wasm/node";
import { pathToFileURL } from "node:url";

import type {
  PlaybackProgressInput,
  PlaybackProgressSummary,
  PlaybackSource,
} from "../shared/types";
import type { LocalDatabase } from "./db";

export class PlaybackService {
  constructor(private readonly db: LocalDatabase) {}

  async getSource(episodeId: string): Promise<PlaybackSource> {
    const episode = this.db.getEpisode(episodeId);
    if (!episode) {
      throw new Error("Episode not found");
    }

    if (episode.downloadedPath && existsSync(episode.downloadedPath)) {
      return {
        episodeId,
        isLocal: true,
        source: pathToFileURL(episode.downloadedPath).toString(),
      };
    }

    if (episode.downloadedPath) this.db.clearDownloadedEpisode(episodeId);
    return {
      episodeId,
      isLocal: false,
      source: episode.audioUrl,
    };
  }

  listProgress(): PlaybackProgressSummary[] {
    return this.db.listPlaybackProgress();
  }

  async saveProgress(progress: PlaybackProgressInput): Promise<void> {
    const episode = this.db.getEpisode(progress.episodeId);
    const podcast = this.db.getPodcast(progress.podcastId);
    if (!episode || !podcast || episode.podcastId !== podcast.id) {
      throw new Error("Episode not found");
    }

    const now = new Date().toISOString();
    const checkpoint = applyLibrary({
      kind: "checkpoint",
      episodeId: progress.episodeId,
      position: progress.currentTime,
      duration: progress.duration,
      updatedAt: now,
    });
    this.db.transaction(() => {
      this.db.savePlaybackProgress({ ...progress, currentTime: checkpoint.position });
      this.db.appendOutbox("playback.checkpoint", {
        currentTime: checkpoint.position,
        duration: progress.duration,
        isCompleted: progress.isCompleted,
        lastPlayedAt: now,
        locator: {
          audioUrl: episode.audioUrl,
          episodeGuid: episode.guid,
          feedUrl: podcast.feedUrl,
        },
        updatedAt: now,
      });
    });
  }
}
