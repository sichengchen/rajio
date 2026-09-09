import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useState, useEffect, useMemo } from "react";
import { usePodcastStore } from "@/lib/store";
import { EpisodeList } from "@/components/common/episode-list";

export function DownloadedPage() {
  useLocale();
  const {
    playEpisode,
    playbackProgress,
    podcasts,
    downloadedEpisodes,
    getDownloadedEpisodes,
    isLoading: storeLoading,
  } = usePodcastStore();
  const currentEpisodeId = usePodcastStore((state) => state.playbackState.currentEpisode?.id);
  const [isLoading, setIsLoading] = useState(true);

  const handleRefresh = async () => {
    try {
      await getDownloadedEpisodes();
    } catch (error) {
      console.error("Failed to refresh download data:", error);
    }
  };

  useEffect(() => {
    setIsLoading(true);

    const loadData = async () => {
      if (!storeLoading) {
        setIsLoading(true);
        try {
          await getDownloadedEpisodes();
        } catch (error) {
          console.error("Failed to load download data:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    // Early return if no podcasts
    if (downloadedEpisodes.length === 0) {
      setIsLoading(false);
      return;
    }

    loadData();
  }, [downloadedEpisodes.length, storeLoading, getDownloadedEpisodes]);

  // Memoize episode processing to avoid recalculation on re-renders
  const processedEpisodes = useMemo(() => {
    return downloadedEpisodes.map((episode) => ({
      ...episode,
      podcast: podcasts.find((p) => p.id === episode.podcastId),
      progress: playbackProgress.get(episode.id),
    }));
  }, [downloadedEpisodes, podcasts, playbackProgress]);

  return (
    <EpisodeList
      currentEpisodeId={currentEpisodeId}
      isLoadingEpisodes={isLoading || storeLoading}
      episodes={processedEpisodes}
      playbackProgress={playbackProgress}
      playEpisode={playEpisode}
      noEpisodesMessage={t("No episodes downloaded yet")}
      noEpisodesMessageDescription={t("Download episodes to play them offline")}
      onDeleteComplete={handleRefresh}
    />
  );
}
