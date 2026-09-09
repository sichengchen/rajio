import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

/**
 * EpisodeList Component
 *
 * IMPORTANT: When modifying this component's structure, also update the corresponding
 * EpisodeSkeleton component at /components/common/episode-list/episode-skeleton.tsx
 * to maintain visual consistency during loading states.
 */

import { useEffect, useRef, useState } from "react";
import { useOpenEpisode } from "@/hooks/use-open-episode";
import { CircleCheck } from "lucide-react";
import {
  List,
  ListItem,
  ListItemActions,
  ListItemLeading,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
} from "@/components/ui-custom/list";
import { CoverImage } from "@/components/ui/cover-image";
import { ContentMetadata } from "@/components/common/content-metadata";
import { cn, formatEpisodeDate, richTextToPlainText } from "@/lib/utils";
import type { Episode, PlaybackProgress } from "@/lib/types";

import { EpisodeSkeleton } from "./episode-skeleton";
import { EpisodeActionsContextMenu, EpisodeActionsMenu } from "./episode-actions-menu";
import { EpisodePlaybackButton } from "./episode-playback-button";
import { episodeListVariantStyles, type EpisodeListVariant } from "./episode-list-styles";

interface EpisodeListProps {
  isLoadingEpisodes: boolean;
  episodes: Episode[];
  playbackProgress: Map<string, PlaybackProgress>;
  playEpisode: (episode: Episode) => void;
  noEpisodesMessage?: string;
  noEpisodesMessageDescription?: string;
  onDownloadComplete?: () => void | Promise<void>;
  onDeleteComplete?: () => void | Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  currentEpisodeId?: string;
  getMetadataItems?: (episode: Episode) => Array<string | null | undefined | false>;
  skeletonCount?: number;
  variant?: EpisodeListVariant;
}

export function EpisodeList({
  isLoadingEpisodes,
  episodes,
  playbackProgress,
  playEpisode,
  noEpisodesMessage,
  noEpisodesMessageDescription,
  onDownloadComplete,
  onDeleteComplete,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  currentEpisodeId,
  getMetadataItems,
  skeletonCount,
  variant = "default",
}: EpisodeListProps) {
  useLocale();
  const openEpisode = useOpenEpisode();
  const variantStyles = episodeListVariantStyles[variant];
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [actionsEpisodeId, setActionsEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !onLoadMore || !hasMore || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onLoadMore();
        }
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Show skeleton while loading episodes
  if (isLoadingEpisodes) {
    return <EpisodeSkeleton count={skeletonCount} variant={variant} />;
  }

  if (episodes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] py-12">
        <div className="text-center text-muted-foreground">
          <p>{noEpisodesMessage ?? t("No episodes found")}</p>
          <p className="text-sm">{noEpisodesMessageDescription ?? t("Try refreshing the podcast")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <List className="px-0">
        {episodes.map((episode) => {
          const progress = playbackProgress.get(episode.id);
          const description = richTextToPlainText(episode.description);
          const metadataItems = getMetadataItems?.(episode) ?? [
            formatEpisodeDate(episode.publishedAt),
          ];
          const showDescription = variant !== "compact";

          return (
            <EpisodeActionsContextMenu
              currentEpisodeId={currentEpisodeId}
              episode={episode}
              key={episode.id}
              onDeleteComplete={onDeleteComplete}
              onDownloadComplete={onDownloadComplete}
            >
              <ListItem
                aria-label={t("Open {name}", { name: episode.title })}
                className={cn(
                  "group rounded-lg px-2 transition-colors hover:bg-muted/55",
                  variantStyles.item,
                )}
                interactive
                onClick={() => openEpisode(episode.id)}
              >
                <ListItemLeading>
                  <CoverImage
                    src={episode.imageUrl}
                    alt={episode.title}
                    className={cn("rounded-md", variantStyles.artwork)}
                    loading="lazy"
                  />
                </ListItemLeading>

                <ListItemContent className={cn("flex flex-col gap-1", variantStyles.content)}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ContentMetadata items={metadataItems} />
                    {progress?.isCompleted ? (
                      <CircleCheck
                        aria-label={t("Listened")}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    ) : null}
                  </div>

                  <ListItemTitle
                    className={cn(
                      "tracking-[-0.01em]",
                      variantStyles.title,
                      variant === "featured" ? "text-base leading-6" : "text-[15px] leading-5",
                    )}
                  >
                    {episode.title}
                  </ListItemTitle>

                  {showDescription && description ? (
                    <ListItemDescription className="mt-0 line-clamp-2 leading-5">
                      {description}
                    </ListItemDescription>
                  ) : null}
                </ListItemContent>

                <ListItemActions className={cn("gap-2", variant === "featured" && "self-center")}>
                  <EpisodePlaybackButton
                    episode={episode}
                    onPlay={playEpisode}
                    progress={progress}
                  />
                  <EpisodeActionsMenu
                    currentEpisodeId={currentEpisodeId}
                    episode={episode}
                    onDeleteComplete={onDeleteComplete}
                    onDownloadComplete={onDownloadComplete}
                    onOpenChange={(open) => setActionsEpisodeId(open ? episode.id : null)}
                    open={actionsEpisodeId === episode.id}
                  />
                </ListItemActions>
              </ListItem>
            </EpisodeActionsContextMenu>
          );
        })}
      </List>
      <div ref={loadMoreRef} className="h-px" />
      {isLoadingMore ? <EpisodeSkeleton count={3} variant={variant} /> : null}
    </>
  );
}
