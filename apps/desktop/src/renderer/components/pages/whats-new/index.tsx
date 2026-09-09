import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePodcastStore } from "@/lib/store";
import { EpisodeList } from "@/components/common/episode-list";
import { formatEpisodeDateGroup } from "@/lib/utils";

export function WhatsNewPage() {
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(true);

  const {
    latestEpisodes,
    latestEpisodesPage,
    loadMoreLatestEpisodes,
    podcasts,
    playEpisode,
    playbackProgress,
    isImporting,
  } = usePodcastStore();
  const currentEpisodeId = usePodcastStore((state) => state.playbackState.currentEpisode?.id);

  useEffect(() => {
    const loadLatestEpisodes = async () => {
      const startTime = performance.now();
      setIsLoading(true);

      try {
        // Use optimized store method that includes caching
        await usePodcastStore.getState().getLatestEpisodes();

        // Performance monitoring in development
        if (import.meta.env.DEV) {
          const loadTime = performance.now() - startTime;
          console.log(`What's New loaded in ${loadTime.toFixed(2)}ms`);
        }
      } catch (error) {
        console.error("Failed to load latest episodes:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Early return if no podcasts
    if (podcasts.length === 0) {
      setIsLoading(false);
      return;
    }

    // Don't reload during OPML import to prevent flicker
    if (isImporting) {
      return;
    }

    if (latestEpisodesPage.loaded) {
      setIsLoading(false);
      return;
    }

    // Start loading immediately
    loadLatestEpisodes();
  }, [podcasts.length, isImporting, latestEpisodesPage.loaded]);

  const handleLoadMore = useCallback(async () => {
    await loadMoreLatestEpisodes();
  }, [loadMoreLatestEpisodes]);

  const podcastsById = useMemo(
    () => new Map(podcasts.map((podcast) => [podcast.id, podcast] as const)),
    [podcasts],
  );
  const episodeGroups = useMemo(() => {
    const groups: Array<{ label: string; episodes: typeof latestEpisodes }> = [];

    for (const episode of latestEpisodes) {
      const label = formatEpisodeDateGroup(episode.publishedAt);
      const currentGroup = groups.at(-1);

      if (currentGroup?.label === label) {
        currentGroup.episodes.push(episode);
      } else {
        groups.push({ episodes: [episode], label });
      }
    }

    return groups;
  }, [latestEpisodes, locale]);
  const getMetadataItems = useCallback(
    (episode: (typeof latestEpisodes)[number]) => [podcastsById.get(episode.podcastId)?.title],
    [podcastsById],
  );

  if (isLoading || episodeGroups.length === 0) {
    return (
      <EpisodeList
        currentEpisodeId={currentEpisodeId}
        isLoadingEpisodes={isLoading}
        episodes={latestEpisodes}
        playbackProgress={playbackProgress}
        playEpisode={playEpisode}
        noEpisodesMessage={t("No episodes found")}
        noEpisodesMessageDescription={t("Subscribe to some podcasts to see the latest episodes here")}
        skeletonCount={7}
        variant="editorial"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-4 pt-5">
      {episodeGroups.map((group, index) => {
        const isLastGroup = index === episodeGroups.length - 1;

        return (
          <section aria-labelledby={`episode-group-${index}`} key={group.label}>
            <h2
              className="px-2 pb-1 text-sm font-semibold text-muted-foreground"
              id={`episode-group-${index}`}
            >
              {group.label}
            </h2>
            <EpisodeList
              currentEpisodeId={currentEpisodeId}
              episodes={group.episodes}
              getMetadataItems={getMetadataItems}
              hasMore={isLastGroup && latestEpisodesPage.hasMore}
              isLoadingEpisodes={false}
              isLoadingMore={
                isLastGroup && latestEpisodesPage.isLoading && latestEpisodesPage.loaded
              }
              onLoadMore={isLastGroup ? handleLoadMore : undefined}
              playbackProgress={playbackProgress}
              playEpisode={playEpisode}
              variant="editorial"
            />
          </section>
        );
      })}
    </div>
  );
}
