import { createWriteStream, existsSync, readdirSync, rmSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DownloadStatus } from "../shared/types";
import type { LocalDatabase } from "./db";

export class DownloadService {
  private storedBytes = 0;
  private active = new Map<
    string,
    { controller: AbortController; bytes: number; promise: Promise<DownloadStatus> }
  >();
  constructor(
    private readonly db: LocalDatabase,
    private readonly resolveDownloadDirectory: () => string,
    private readonly changed: (status: DownloadStatus) => void = () => {},
  ) {
    const directories = new Set([resolveDownloadDirectory()]);
    for (const episode of db.listEpisodes()) {
      if (episode.downloadedPath) {
        directories.add(path.dirname(episode.downloadedPath));
        if (!existsSync(episode.downloadedPath)) {
          db.clearDownloadedEpisode(episode.id);
          this.save({
            episodeId: episode.id,
            progress: 0,
            status: "failed",
            error: "Downloaded file is missing. Download it again.",
          });
        }
      } else if (db.getDownloadStatus(episode.id).status === "downloading") {
        this.save({
          episodeId: episode.id,
          progress: 0,
          status: "failed",
          error: "Download interrupted. Try again.",
        });
      }
    }
    this.storedBytes = db.downloadedBytes();
    for (const directory of directories) {
      try {
        if (existsSync(directory))
          for (const filename of readdirSync(directory)) {
            if (/^\.rajio-[\w-]+\.part$/.test(filename))
              rmSync(path.join(directory, filename), { force: true });
          }
      } catch {
        /* A disconnected download volume must not prevent the library from opening. */
      }
    }
  }

  start(episodeId: string): Promise<DownloadStatus> {
    const existing = this.active.get(episodeId);
    if (existing) return existing.promise;
    this.storedBytes = this.db.downloadedBytes();
    const entry = {
      controller: new AbortController(),
      bytes: 0,
      promise: Promise.resolve({ episodeId, progress: 0, status: "queued" } as DownloadStatus),
    };
    this.active.set(episodeId, entry);
    entry.promise = this.download(episodeId, entry).finally(() => this.active.delete(episodeId));
    return entry.promise;
  }

  private async download(
    episodeId: string,
    entry: { controller: AbortController; bytes: number },
  ): Promise<DownloadStatus> {
    const episode = this.db.getEpisode(episodeId);
    if (!episode) return { episodeId, progress: 0, status: "missing" };
    if (episode.downloadedPath && existsSync(episode.downloadedPath))
      return this.db.getDownloadStatus(episodeId);
    this.save({ episodeId, progress: 0, status: "downloading" });
    let temporary: string | undefined;
    let destination: string | undefined;
    try {
      const directory = this.resolveDownloadDirectory();
      await mkdir(directory, { recursive: true });
      temporary = path.join(directory, ".rajio-" + crypto.randomUUID() + ".part");
      const response = await fetch(episode.audioUrl, {
        signal: AbortSignal.any([entry.controller.signal, AbortSignal.timeout(24 * 3600_000)]),
      });
      if (!response.ok) throw new Error("Download failed with HTTP " + response.status);
      if (!response.body) throw new Error("Download returned no audio");
      const expected = Number(response.headers.get("content-length")) || 0;
      let lastProgress = -1;
      const meter = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          entry.bytes += chunk.length;
          const limit = Number(this.db.getSettings().downloadLimitBytes ?? 2147483648);
          const stored = this.storedBytes;
          const pending = [...this.active.values()].reduce((sum, entry) => sum + entry.bytes, 0);
          if (stored + pending > limit) {
            callback(
              new Error(
                "Download storage limit reached. Remove downloads or increase the limit in Settings.",
              ),
            );
            return;
          }
          const progress =
            expected > 0 ? Math.min(99, Math.floor((entry.bytes / expected) * 100)) : 0;
          if (progress !== lastProgress) {
            lastProgress = progress;
            this.save({ episodeId, progress, status: "downloading" });
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        meter,
        createWriteStream(temporary, { flags: "wx" }),
        { signal: entry.controller.signal },
      );
      if (entry.bytes === 0) throw new Error("Download returned no audio");
      if (!this.db.getEpisode(episodeId)) throw new Error("Episode was removed during download");
      destination = path.join(directory, episode.id + extensionFromUrl(episode.audioUrl));
      await rename(temporary, destination);
      temporary = undefined;
      entry.controller.signal.throwIfAborted();
      this.db.transaction(() =>
        this.db.markEpisodeDownloaded(episodeId, destination!, entry.bytes),
      );
      this.storedBytes += entry.bytes;
      entry.bytes = 0;
      const result = this.db.getDownloadStatus(episodeId);
      this.changed(result);
      return result;
    } catch (error) {
      if (temporary) await rm(temporary, { force: true });
      if (destination) await rm(destination, { force: true });
      const status: DownloadStatus = {
        episodeId,
        progress: 0,
        status: entry.controller.signal.aborted ? "queued" : "failed",
        ...(entry.controller.signal.aborted
          ? {}
          : { error: error instanceof Error ? error.message : "Download failed" }),
      };
      if (this.db.getEpisode(episodeId)) this.save(status);
      return status;
    }
  }

  async cancel(episodeId: string): Promise<void> {
    const active = this.active.get(episodeId);
    if (active) {
      active.controller.abort();
      await active.promise;
    }
  }

  async delete(episodeId: string): Promise<void> {
    await this.cancel(episodeId);
    const episode = this.db.getEpisode(episodeId);
    if (!episode) return;
    if (episode.downloadedPath) await rm(episode.downloadedPath, { force: true });
    this.storedBytes = Math.max(0, this.storedBytes - (episode.fileSize ?? 0));
    this.db.clearDownloadedEpisode(episodeId);
    this.changed(this.db.getDownloadStatus(episodeId));
  }

  statuses(): DownloadStatus[] {
    return this.db.listEpisodes().map((episode) => this.db.getDownloadStatus(episode.id));
  }
  private save(status: DownloadStatus) {
    this.db.saveDownloadStatus(status);
    this.changed(status);
  }
}

function extensionFromUrl(url: string): string {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return [".mp3", ".m4a", ".mp4", ".wav", ".aac", ".aiff", ".aif", ".ogg", ".opus"].includes(
    extension,
  )
    ? extension
    : ".mp3";
}
