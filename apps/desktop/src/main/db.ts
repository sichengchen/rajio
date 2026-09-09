import { applyLibrary } from "@rajio-app/core-wasm/node";
import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type {
  DesktopSettings,
  DownloadStatus,
  EpisodePage,
  EpisodePageRequest,
  EpisodeSearchRequest,
  EpisodeSummary,
  PlaybackProgressInput,
  PlaybackProgressSummary,
  PodcastSummary,
} from "../shared/types";

export interface SyncOutboxEntry {
  id: string;
  kind: string;
  payload: unknown;
  updatedAt: string;
}

export interface FeedHTTPState {
  etag?: string;
  modified?: string;
  checkedAt: number;
  nextAttempt: number;
  failures: number;
  error?: string;
}

export const localDatabaseSchema = [
  `CREATE TABLE IF NOT EXISTS feed_http (podcast_id TEXT PRIMARY KEY REFERENCES podcasts(id) ON DELETE CASCADE, record TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS podcasts (
    id TEXT PRIMARY KEY,
    feed_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    image_url TEXT,
    language TEXT,
    subscription_date TEXT NOT NULL,
    last_updated TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    podcast_id TEXT NOT NULL,
    guid TEXT,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    audio_url TEXT NOT NULL,
    image_url TEXT,
    published_at TEXT,
    duration INTEGER,
    downloaded_path TEXT,
    file_size INTEGER,
    downloaded_at TEXT,
    FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS playback_progress (
    episode_id TEXT PRIMARY KEY,
    podcast_id TEXT NOT NULL,
    current_time REAL NOT NULL,
    duration REAL NOT NULL,
    is_completed INTEGER NOT NULL,
    last_played_at TEXT NOT NULL,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS download_tasks (
    episode_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    progress REAL NOT NULL,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const;

type Row = Record<string, unknown>;

const defaultEpisodePageLimit = 20;
const maxEpisodePageLimit = 100;

export class LocalDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON");
    for (const statement of localDatabaseSchema) {
      this.db.exec(statement);
    }
  }

  getFeedHTTP(podcastId: string): FeedHTTPState | undefined {
    const row = this.db
      .prepare("SELECT record FROM feed_http WHERE podcast_id=?")
      .get(podcastId) as { record: string } | undefined;
    return row ? JSON.parse(row.record) : undefined;
  }
  saveFeedHTTP(podcastId: string, state: FeedHTTPState): void {
    this.db
      .prepare(
        "INSERT INTO feed_http VALUES (?, ?) ON CONFLICT(podcast_id) DO UPDATE SET record=excluded.record",
      )
      .run(podcastId, JSON.stringify(state));
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  close(): void {
    this.db.close();
  }

  listPodcasts(): PodcastSummary[] {
    return this.db
      .prepare(
        `SELECT
          id,
          feed_url,
          title,
          author,
          description,
          image_url,
          language,
          subscription_date,
          last_updated
        FROM podcasts
        ORDER BY title COLLATE NOCASE`,
      )
      .all()
      .map(toPodcastSummary);
  }

  listPodcastArtworkUrls(): string[] {
    return this.db
      .prepare(
        `SELECT image_url
        FROM podcasts
        WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
        ORDER BY title COLLATE NOCASE`,
      )
      .all()
      .map((row) => String((row as Row).image_url));
  }

  listEpisodeArtworkUrls(): string[] {
    return this.db
      .prepare(
        `SELECT image_url
        FROM episodes
        WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
        ORDER BY published_at DESC, id DESC`,
      )
      .all()
      .map((row) => String((row as Row).image_url));
  }

  getPodcast(podcastId: string): PodcastSummary | null {
    const row = this.db
      .prepare(
        `SELECT
          id,
          feed_url,
          title,
          author,
          description,
          image_url,
          language,
          subscription_date,
          last_updated
        FROM podcasts
        WHERE id = ?`,
      )
      .get(podcastId);

    return row ? toPodcastSummary(row as Row) : null;
  }

  getPodcastByFeedUrl(feedUrl: string): PodcastSummary | null {
    const row = this.db
      .prepare(
        `SELECT
          id,
          feed_url,
          title,
          author,
          description,
          image_url,
          language,
          subscription_date,
          last_updated
        FROM podcasts
        WHERE feed_url = ?`,
      )
      .get(feedUrl);

    return row ? toPodcastSummary(row as Row) : null;
  }

  upsertPodcast(podcast: PodcastSummary): void {
    this.db
      .prepare(
        `INSERT INTO podcasts (
          id,
          feed_url,
          title,
          author,
          description,
          image_url,
          language,
          subscription_date,
          last_updated
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          feed_url = excluded.feed_url,
          title = excluded.title,
          author = excluded.author,
          description = excluded.description,
          image_url = excluded.image_url,
          language = excluded.language,
          last_updated = excluded.last_updated`,
      )
      .run(
        podcast.id,
        podcast.feedUrl,
        podcast.title,
        podcast.author ?? null,
        podcast.description ?? null,
        podcast.imageUrl ?? null,
        podcast.language ?? null,
        podcast.subscriptionDate ?? new Date().toISOString(),
        podcast.lastUpdated ?? new Date().toISOString(),
      );
  }

  deletePodcast(podcastId: string): PodcastSummary | null {
    const existing = this.getPodcast(podcastId);
    if (!existing) {
      return null;
    }

    this.db.prepare("DELETE FROM podcasts WHERE id = ?").run(podcastId);
    return existing;
  }

  deletePodcastByFeedUrl(feedUrl: string): PodcastSummary | null {
    const existing = this.getPodcastByFeedUrl(feedUrl);
    if (!existing) {
      return null;
    }

    this.db.prepare("DELETE FROM podcasts WHERE feed_url = ?").run(feedUrl);
    return existing;
  }

  listEpisodesByPodcast(podcastId: string): EpisodeSummary[] {
    return this.db
      .prepare(
        `SELECT
          id,
          podcast_id,
          guid,
          title,
          description,
          content,
          audio_url,
          image_url,
          published_at,
          duration,
          downloaded_path,
          file_size,
          downloaded_at
        FROM episodes
        WHERE podcast_id = ?
        ORDER BY published_at DESC`,
      )
      .all(podcastId)
      .map(toEpisodeSummary);
  }

  listEpisodesByPodcastPage(podcastId: string, request: EpisodePageRequest = {}): EpisodePage {
    const page = normalizePageRequest(request);
    const total = readCount(
      this.db.prepare("SELECT COUNT(*) AS total FROM episodes WHERE podcast_id = ?").get(podcastId),
    );
    const rows = this.db
      .prepare(
        `SELECT
          id,
          podcast_id,
          guid,
          title,
          description,
          content,
          audio_url,
          image_url,
          published_at,
          duration,
          downloaded_path,
          file_size,
          downloaded_at
        FROM episodes
        WHERE podcast_id = ?
        ORDER BY published_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      )
      .all(podcastId, page.limit + 1, page.offset)
      .map(toEpisodeSummary);

    return toEpisodePage(rows, page, total);
  }

  listLatestEpisodes(request: EpisodePageRequest = {}): EpisodePage {
    const page = normalizePageRequest(request);
    const total = readCount(this.db.prepare("SELECT COUNT(*) AS total FROM episodes").get());
    const rows = this.db
      .prepare(
        `SELECT
          id,
          podcast_id,
          guid,
          title,
          description,
          content,
          audio_url,
          image_url,
          published_at,
          duration,
          downloaded_path,
          file_size,
          downloaded_at
        FROM episodes
        ORDER BY published_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      )
      .all(page.limit + 1, page.offset)
      .map(toEpisodeSummary);

    return toEpisodePage(rows, page, total);
  }

  listEpisodes(): EpisodeSummary[] {
    return this.db
      .prepare(
        `SELECT
          id,
          podcast_id,
          guid,
          title,
          description,
          content,
          audio_url,
          image_url,
          published_at,
          duration,
          downloaded_path,
          file_size,
          downloaded_at
        FROM episodes
        ORDER BY podcast_id, published_at DESC`,
      )
      .all()
      .map(toEpisodeSummary);
  }

  searchEpisodes(request: EpisodeSearchRequest): EpisodePage {
    const query = request.query.trim().toLowerCase();
    const page = normalizePageRequest(request);

    if (!query) {
      return {
        episodes: [],
        hasMore: false,
        nextOffset: page.offset,
        total: 0,
      };
    }

    const escapedQuery = escapeLikePattern(query);
    const contains = `%${escapedQuery}%`;
    const prefix = `${escapedQuery}%`;
    const wordPrefix = `% ${escapedQuery}%`;
    const total = readCount(
      this.db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM episodes
           WHERE LOWER(title) LIKE ? ESCAPE '\\'
             OR LOWER(COALESCE(description, '')) LIKE ? ESCAPE '\\'
             OR LOWER(COALESCE(content, '')) LIKE ? ESCAPE '\\'`,
        )
        .get(contains, contains, contains),
    );
    const rows = this.db
      .prepare(
        `SELECT
          id,
          podcast_id,
          guid,
          title,
          description,
          content,
          audio_url,
          image_url,
          published_at,
          duration,
          downloaded_path,
          file_size,
          downloaded_at
        FROM episodes
        WHERE LOWER(title) LIKE ? ESCAPE '\\'
          OR LOWER(COALESCE(description, '')) LIKE ? ESCAPE '\\'
          OR LOWER(COALESCE(content, '')) LIKE ? ESCAPE '\\'
        ORDER BY
          CASE
            WHEN LOWER(title) = ? THEN 0
            WHEN LOWER(title) LIKE ? ESCAPE '\\' THEN 1
            WHEN LOWER(title) LIKE ? ESCAPE '\\' THEN 2
            WHEN LOWER(title) LIKE ? ESCAPE '\\' THEN 3
            ELSE 5
          END,
          published_at DESC,
          id DESC
        LIMIT ? OFFSET ?`,
      )
      .all(
        contains,
        contains,
        contains,
        query,
        prefix,
        wordPrefix,
        contains,
        page.limit + 1,
        page.offset,
      )
      .map(toEpisodeSummary);

    return toEpisodePage(rows, page, total);
  }

  getEpisode(episodeId: string): EpisodeSummary | null {
    const row = this.db
      .prepare(
        `SELECT
          id,
          podcast_id,
          guid,
          title,
          description,
          content,
          audio_url,
          image_url,
          published_at,
          duration,
          downloaded_path,
          file_size,
          downloaded_at
        FROM episodes
        WHERE id = ?`,
      )
      .get(episodeId);

    return row ? toEpisodeSummary(row as Row) : null;
  }

  findEpisodeByLocator(input: {
    audioUrl: string;
    episodeGuid?: string;
    feedUrl: string;
  }): EpisodeSummary | null {
    const row = this.db
      .prepare(
        `SELECT
          episodes.id,
          episodes.podcast_id,
          episodes.guid,
          episodes.title,
          episodes.description,
          episodes.content,
          episodes.audio_url,
          episodes.image_url,
          episodes.published_at,
          episodes.duration,
          episodes.downloaded_path,
          episodes.file_size,
          episodes.downloaded_at
        FROM episodes
        INNER JOIN podcasts ON podcasts.id = episodes.podcast_id
        WHERE podcasts.feed_url = ?
          AND (episodes.audio_url = ? OR episodes.guid = ?)
        LIMIT 1`,
      )
      .get(input.feedUrl, input.audioUrl, input.episodeGuid ?? "");

    return row ? toEpisodeSummary(row as Row) : null;
  }

  upsertEpisodes(episodes: EpisodeSummary[]): void {
    const statement = this.db.prepare(
      `INSERT INTO episodes (
        id,
        podcast_id,
        guid,
        title,
        description,
        content,
        audio_url,
        image_url,
        published_at,
        duration,
        downloaded_path,
        file_size,
        downloaded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        podcast_id = excluded.podcast_id,
        guid = excluded.guid,
        title = excluded.title,
        description = excluded.description,
        content = excluded.content,
        audio_url = excluded.audio_url,
        image_url = excluded.image_url,
        published_at = excluded.published_at,
        duration = excluded.duration`,
    );

    for (const episode of episodes) {
      statement.run(
        episode.id,
        episode.podcastId,
        episode.guid ?? null,
        episode.title,
        episode.description ?? null,
        episode.content ?? null,
        episode.audioUrl,
        episode.imageUrl ?? null,
        episode.publishedAt ?? null,
        episode.duration ?? null,
        episode.downloadedPath ?? null,
        episode.fileSize ?? null,
        episode.downloadedAt ?? null,
      );
    }
  }

  reconcileEpisodes(podcastId: string, incoming: EpisodeSummary[]): void {
    const existing = this.db
      .prepare(
        "SELECT id, podcast_id, audio_url, guid, title FROM episodes WHERE podcast_id=? ORDER BY rowid",
      )
      .all(podcastId)
      .map(toEpisodeSummary);
    const plan = applyLibrary({ kind: "reconcileEpisodes", incoming, existing });
    this.upsertEpisodes(plan.episodes);
    for (const [old, canonical] of Object.entries(plan.aliases)) {
      this.db
        .prepare(`INSERT INTO playback_progress SELECT ?, podcast_id, "current_time", duration, is_completed, last_played_at FROM playback_progress WHERE episode_id=?
        ON CONFLICT(episode_id) DO UPDATE SET "current_time"=excluded."current_time", duration=excluded.duration, is_completed=excluded.is_completed, last_played_at=excluded.last_played_at WHERE excluded.last_played_at > playback_progress.last_played_at`)
        .run(canonical, old);
      this.db
        .prepare(
          `UPDATE episodes SET downloaded_path=(SELECT downloaded_path FROM episodes WHERE id=?), file_size=(SELECT file_size FROM episodes WHERE id=?), downloaded_at=(SELECT downloaded_at FROM episodes WHERE id=?) WHERE id=? AND downloaded_path IS NULL`,
        )
        .run(old, old, old, canonical);
      // Persisted renderer collections store episode IDs in JSON arrays/objects.
      const preferences = this.db.prepare("SELECT key, value FROM preferences").all() as {
        key: string;
        value: string;
      }[];
      for (const preference of preferences) {
        try {
          const replaced = JSON.stringify(JSON.parse(preference.value), (_key, value) =>
            value === old ? canonical : value,
          );
          if (replaced !== preference.value)
            this.db
              .prepare("UPDATE preferences SET value=? WHERE key=?")
              .run(replaced, preference.key);
        } catch {
          /* Non-JSON preferences do not contain episode collections. */
        }
      }
      this.db.prepare("DELETE FROM episodes WHERE id=?").run(old);
    }
  }

  savePlaybackProgress(progress: PlaybackProgressInput): void {
    const lastPlayedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO playback_progress (
          episode_id,
          podcast_id,
          "current_time",
          duration,
          is_completed,
          last_played_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(episode_id) DO UPDATE SET
          podcast_id = excluded.podcast_id,
          "current_time" = excluded."current_time",
          duration = excluded.duration,
          is_completed = excluded.is_completed,
          last_played_at = excluded.last_played_at`,
      )
      .run(
        progress.episodeId,
        progress.podcastId,
        progress.currentTime,
        progress.duration,
        progress.isCompleted ? 1 : 0,
        lastPlayedAt,
      );
  }

  getPlaybackProgress(episodeId: string): PlaybackProgressInput | null {
    const row = this.db
      .prepare(
        `SELECT
          episode_id,
          podcast_id,
          "current_time",
          duration,
          is_completed
        FROM playback_progress
        WHERE episode_id = ?`,
      )
      .get(episodeId) as Row | undefined;

    if (!row) {
      return null;
    }

    return {
      currentTime: maybeNumber(row.current_time) ?? 0,
      duration: maybeNumber(row.duration) ?? 0,
      episodeId: requireString(row, "episode_id"),
      isCompleted: row.is_completed === 1,
      podcastId: requireString(row, "podcast_id"),
    };
  }

  listPlaybackProgress(): PlaybackProgressSummary[] {
    const rows = this.db
      .prepare(
        `SELECT
          episode_id,
          podcast_id,
          "current_time",
          duration,
          is_completed,
          last_played_at
        FROM playback_progress
        ORDER BY last_played_at DESC`,
      )
      .all() as Row[];

    return rows.map((row) => ({
      currentTime: maybeNumber(row.current_time) ?? 0,
      duration: maybeNumber(row.duration) ?? 0,
      episodeId: requireString(row, "episode_id"),
      isCompleted: row.is_completed === 1,
      lastPlayedAt: requireString(row, "last_played_at"),
      podcastId: requireString(row, "podcast_id"),
    }));
  }

  downloadedBytes(): number {
    return Number(
      (
        this.db
          .prepare(
            "SELECT COALESCE(SUM(file_size),0) AS total FROM episodes WHERE downloaded_path IS NOT NULL",
          )
          .get() as { total: number }
      ).total,
    );
  }

  getDownloadStatus(episodeId: string): DownloadStatus {
    const row = this.db
      .prepare(
        `SELECT
          download_tasks.status,
          download_tasks.progress,
          download_tasks.error,
          episodes.downloaded_path
        FROM episodes
        LEFT JOIN download_tasks ON download_tasks.episode_id = episodes.id
        WHERE episodes.id = ?`,
      )
      .get(episodeId) as Row | undefined;

    if (!row) {
      return { episodeId, progress: 0, status: "missing" };
    }

    if (typeof row.downloaded_path === "string" && row.downloaded_path.length > 0) {
      return {
        downloadedPath: row.downloaded_path,
        episodeId,
        progress: 100,
        status: "downloaded",
      };
    }

    return {
      episodeId,
      error: maybeString(row.error),
      progress: maybeNumber(row.progress) ?? 0,
      status: toDownloadStatus(row.status),
    };
  }

  saveDownloadStatus(status: DownloadStatus): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO download_tasks (
          episode_id,
          status,
          progress,
          error,
          started_at,
          completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(episode_id) DO UPDATE SET
          status = excluded.status,
          progress = excluded.progress,
          error = excluded.error,
          completed_at = excluded.completed_at`,
      )
      .run(
        status.episodeId,
        status.status,
        status.progress,
        status.error ?? null,
        now,
        status.status === "downloaded" ? now : null,
      );
  }

  markEpisodeDownloaded(episodeId: string, filePath: string, fileSize: number): void {
    const downloadedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE episodes
        SET downloaded_path = ?,
          file_size = ?,
          downloaded_at = ?
        WHERE id = ?`,
      )
      .run(filePath, fileSize, downloadedAt, episodeId);

    this.saveDownloadStatus({
      downloadedPath: filePath,
      episodeId,
      progress: 100,
      status: "downloaded",
    });
  }

  clearDownloadedEpisode(episodeId: string): void {
    this.db
      .prepare(
        `UPDATE episodes
        SET downloaded_path = NULL,
          file_size = NULL,
          downloaded_at = NULL
        WHERE id = ?`,
      )
      .run(episodeId);

    this.saveDownloadStatus({
      episodeId,
      progress: 0,
      status: "queued",
    });
  }

  getSettings(): DesktopSettings {
    const rows = this.db.prepare("SELECT key, value FROM preferences").all() as Row[];
    return rows.reduce<DesktopSettings>((settings, row) => {
      const key = maybeString(row.key);
      if (!key) {
        return settings;
      }

      return {
        ...settings,
        [key]: maybeString(row.value),
      };
    }, {});
  }

  setSettings(settings: DesktopSettings): DesktopSettings {
    const statement = this.db.prepare(
      `INSERT INTO preferences (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );

    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === "string") {
        statement.run(key, value);
      }
    }

    return this.getSettings();
  }

  appendOutbox(kind: string, payload: unknown): void {
    this.db
      .prepare(
        `INSERT INTO sync_outbox (id, kind, payload, updated_at)
        VALUES (?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), kind, JSON.stringify(payload), new Date().toISOString());
  }

  listOutbox(): SyncOutboxEntry[] {
    return (
      this.db
        .prepare(
          `SELECT id, kind, payload, updated_at
          FROM sync_outbox
          ORDER BY updated_at ASC`,
        )
        .all() as Row[]
    ).map((row) => ({
      id: requireString(row, "id"),
      kind: requireString(row, "kind"),
      payload: JSON.parse(requireString(row, "payload")) as unknown,
      updatedAt: requireString(row, "updated_at"),
    }));
  }

  deleteOutboxEntry(id: string): void {
    this.db.prepare("DELETE FROM sync_outbox WHERE id = ?").run(id);
  }
}

export function createLocalDatabase(userDataPath: string): LocalDatabase {
  return new LocalDatabase(getDatabasePath(userDataPath));
}

export function getDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, "newcastle.sqlite");
}

function maybeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function maybeNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function requireString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }
  return value;
}

function normalizePageRequest(request: EpisodePageRequest) {
  const requestedLimit = Math.trunc(request.limit ?? defaultEpisodePageLimit);
  const requestedOffset = Math.trunc(request.offset ?? 0);

  return {
    limit: Math.min(Math.max(requestedLimit, 1), maxEpisodePageLimit),
    offset: Math.max(requestedOffset, 0),
  };
}

function toEpisodePage(
  rows: EpisodeSummary[],
  page: { limit: number; offset: number },
  total: number,
): EpisodePage {
  const episodes = rows.slice(0, page.limit);

  return {
    episodes,
    hasMore: rows.length > page.limit,
    nextOffset: page.offset + episodes.length,
    total,
  };
}

function readCount(row: unknown): number {
  return maybeNumber((row as Row | undefined)?.total) ?? 0;
}

function toPodcastSummary(row: unknown): PodcastSummary {
  const record = row as Row;
  return {
    author: maybeString(record.author),
    description: maybeString(record.description),
    feedUrl: requireString(record, "feed_url"),
    id: requireString(record, "id"),
    imageUrl: maybeString(record.image_url),
    language: maybeString(record.language),
    lastUpdated: requireString(record, "last_updated"),
    subscriptionDate: requireString(record, "subscription_date"),
    title: requireString(record, "title"),
  };
}

function toEpisodeSummary(row: unknown): EpisodeSummary {
  const record = row as Row;
  return {
    audioUrl: requireString(record, "audio_url"),
    content: maybeString(record.content),
    description: maybeString(record.description),
    downloadedAt: maybeString(record.downloaded_at),
    downloadedPath: maybeString(record.downloaded_path),
    duration: maybeNumber(record.duration),
    fileSize: maybeNumber(record.file_size),
    guid: maybeString(record.guid),
    id: requireString(record, "id"),
    imageUrl: maybeString(record.image_url),
    podcastId: requireString(record, "podcast_id"),
    publishedAt: maybeString(record.published_at),
    title: requireString(record, "title"),
  };
}

function toDownloadStatus(value: unknown): DownloadStatus["status"] {
  if (
    value === "queued" ||
    value === "downloading" ||
    value === "downloaded" ||
    value === "failed"
  ) {
    return value;
  }

  return "queued";
}
