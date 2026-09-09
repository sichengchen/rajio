import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useMemo } from "react";

import { EpisodeList } from "@/components/common/episode-list";
import { usePodcastStore } from "@/lib/store";

export function FavoritesPage() {
  useLocale();
  const favoriteEpisodes = usePodcastStore((state) => state.favoriteEpisodes);
  const playbackProgress = usePodcastStore((state) => state.playbackProgress);
  const podcasts = usePodcastStore((state) => state.podcasts);
  const playEpisode = usePodcastStore((state) => state.playEpisode);
  const currentEpisodeId = usePodcastStore((state) => state.playbackState.currentEpisode?.id);

  const episodes = useMemo(
    () =>
      favoriteEpisodes.map((episode) => ({
        ...episode,
        podcast: podcasts.find((podcast) => podcast.id === episode.podcastId),
        progress: playbackProgress.get(episode.id),
      })),
    [favoriteEpisodes, playbackProgress, podcasts],
  );

  return (
    <EpisodeList
      currentEpisodeId={currentEpisodeId}
      episodes={episodes}
      isLoadingEpisodes={false}
      noEpisodesMessage={t("No favorite episodes yet")}
      noEpisodesMessageDescription={t("Save an episode from its menu to find it here")}
      playbackProgress={playbackProgress}
      playEpisode={playEpisode}
    />
  );
}
