import { applyLibrary } from "@rajio-app/core-wasm/node";
import path from "node:path";

import type { DesktopSettings } from "../shared/types";
import type { LocalDatabase } from "./db";

export function resolveDefaultDownloadDirectory(
  platform: NodeJS.Platform,
  appName: string,
  appDataDirectory: string,
  downloadsDirectory: string,
): string {
  return platform === "darwin"
    ? path.join(appDataDirectory, appName, "Downloads")
    : path.join(downloadsDirectory, appName);
}

export class SettingsService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly defaultDownloadDirectory?: string,
  ) {}

  async get(): Promise<DesktopSettings> {
    const settings = this.db.getSettings();
    const downloadDirectory = settings.downloadDirectory ?? this.defaultDownloadDirectory;

    return {
      ...settings,
      ...(downloadDirectory ? { downloadDirectory } : {}),
    };
  }

  async set(settings: DesktopSettings): Promise<DesktopSettings> {
    if (settings.downloadDirectory && !path.isAbsolute(settings.downloadDirectory)) {
      throw new Error("Download directory must be an absolute path.");
    }

    if (
      settings.downloadLimitBytes !== undefined &&
      (!Number.isSafeInteger(Number(settings.downloadLimitBytes)) ||
        Number(settings.downloadLimitBytes) <= 0)
    )
      throw new Error("Download limit must be a positive number of bytes.");
    this.db.transaction(() => {
      const normalized = { ...settings };
      for (const [key, name] of [["favoriteEpisodes", "favorites"], ["playbackQueue", "queue"]] as const) {
        const value = settings[key];
        if (value === undefined) continue;
        const parsed = JSON.parse(value);
        if (parsed?.version !== 1 || !Array.isArray(parsed.episodeIds) ||
            !parsed.episodeIds.every((id: unknown) => typeof id === "string")) {
          throw new Error("Invalid collection payload");
        }
        const ids = applyLibrary({ kind: "normalizeCollection", name, ids: parsed.episodeIds });
        normalized[key] = JSON.stringify({ episodeIds: ids, version: 1 });
        if (normalized[key] !== this.db.getSettings()[key]) {
          this.db.appendOutbox(`collection.${name}.v1`, ids);
        }
      }
      this.db.setSettings(normalized);
    });
    return this.get();
  }

  getDownloadDirectory(): string {
    const downloadDirectory =
      this.db.getSettings().downloadDirectory ?? this.defaultDownloadDirectory;
    if (!downloadDirectory) {
      throw new Error("Download directory is unavailable.");
    }

    return downloadDirectory;
  }

  async setDownloadDirectory(downloadDirectory: string): Promise<string> {
    await this.set({ downloadDirectory });
    return this.getDownloadDirectory();
  }
}
