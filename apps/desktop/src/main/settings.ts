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
    this.db.setSettings(settings);
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
