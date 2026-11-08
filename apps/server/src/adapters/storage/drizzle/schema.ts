import type { PodcastMetadata } from "@rajio-app/contracts";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const subscriptions = sqliteTable("subscriptions", {
  deletedAt: integer("deleted_at", { mode: "number" }),
  feedUrl: text("feed_url").primaryKey(),
  metadata: text("metadata", { mode: "json" }).$type<PodcastMetadata>(),
  status: text("status").notNull(),
  subscribedAt: integer("subscribed_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const playbackCheckpoints = sqliteTable("playback_checkpoints", {
  audioUrl: text("audio_url").notNull(),
  currentTime: real("current_time").notNull(),
  duration: real("duration").notNull(),
  episodeGuid: text("episode_guid"),
  feedUrl: text("feed_url").notNull(),
  id: text("id").primaryKey(),
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull(),
  lastPlayedAt: integer("last_played_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const currentPlayback = sqliteTable("current_playback", {
  audioUrl: text("audio_url").notNull(),
  currentTime: real("current_time").notNull(),
  duration: real("duration").notNull(),
  episodeGuid: text("episode_guid"),
  feedUrl: text("feed_url").notNull(),
  id: integer("id").primaryKey(),
  sourceDeviceId: text("source_device_id").notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const syncPreferences = sqliteTable("sync_preferences", {
  autoPlay: integer("auto_play", { mode: "boolean" }).notNull(),
  id: integer("id").primaryKey(),
  itunesSearchEnabled: integer("itunes_search_enabled", { mode: "boolean" }).notNull(),
  skipInterval: integer("skip_interval").notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  whatsNewCount: integer("whats_new_count").notNull(),
});

export const schema = {
  currentPlayback,
  playbackCheckpoints,
  subscriptions,
  syncPreferences,
};
