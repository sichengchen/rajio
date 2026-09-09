export interface ParseFeedRequest {
  feedUrl: string;
  xml: string;
  fetchedAt: string;
}

export interface Podcast {
  id: string;
  feedUrl: string;
  title: string;
  author?: string;
  description: string;
  imageUrl?: string;
  language?: string;
  subscriptionDate: string;
  lastUpdated: string;
}

export interface Episode {
  id: string;
  podcastId: string;
  guid?: string;
  title: string;
  description: string;
  content?: string;
  audioUrl: string;
  imageUrl?: string;
  publishedAt?: string;
  duration?: number;
}

export interface ParsedFeed {
  podcast: Podcast;
  episodes: Episode[];
}

export function initializeCore(module: BufferSource | WebAssembly.Module): void;
export function parseFeed(request: ParseFeedRequest): ParsedFeed;

export function applyLibrary(request: {
  kind: "subscription";
  feedUrl: string;
  existingDate?: string | null;
  fetchedAt: string;
}): { subscriptionDate: string; isNew: boolean };
export function applyLibrary(request: {
  kind: "checkpoint";
  episodeId: string;
  position: number;
  duration: number;
  updatedAt: string;
}): { episodeId: string; position: number; duration: number; updatedAt: string };
export function applyLibrary(request: {
  kind: "collection";
  ids: string[];
  episodeId: string;
  included: boolean;
  index?: number;
}): string[];
export function applyLibrary(request: { kind: "importOpml"; xml: string }): string[];

export function applyLibrary(request: {
  kind: "reconcileEpisodes";
  incoming: Array<Omit<Episode, "description"> & { description?: string }>;
  existing: Array<Omit<Episode, "description"> & { description?: string }>;
}): { episodes: Episode[]; aliases: Record<string, string> };

export function applyLibrary(request: {
  kind: "normalizeCollection";
  name: "favorites" | "queue";
  ids: string[];
}): string[];
