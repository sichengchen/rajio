import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useEffect, useState } from "react";
import { useCanGoBack, useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { PageNavigation } from "@/components/common/page-navigation";
import { ContentDetailsHeader } from "@/components/common/content-details-header";
import { EpisodeActionsMenu } from "@/components/common/episode-list/episode-actions-menu";
import { EpisodePlaybackButton } from "@/components/common/episode-list/episode-playback-button";
import { ShowNotesReader } from "@/components/common/show-notes-reader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePodcastStore } from "@/lib/store";
import type { Episode } from "@/lib/types";
import { formatEpisodeDate } from "@/lib/utils";

interface EpisodePageProps {
  episodeId: string;
}

export function EpisodePage({ episodeId }: EpisodePageProps) {
  useLocale();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const previousPageTitle = useLocation({ select: (location) => location.state.previousPageTitle });
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const currentEpisodeId = usePodcastStore((state) => state.playbackState.currentEpisode?.id);
  const getEpisode = usePodcastStore((state) => state.getEpisode);
  const playbackProgress = usePodcastStore((state) => state.playbackProgress);
  const playEpisode = usePodcastStore((state) => state.playEpisode);
  const podcasts = usePodcastStore((state) => state.podcasts);
  const seekToTime = usePodcastStore((state) => state.seekToTime);

  useEffect(() => {
    let active = true;

    const loadEpisode = async () => {
      setIsLoading(true);
      const nextEpisode = await getEpisode(episodeId);
      if (active) {
        setEpisode(nextEpisode);
        setIsLoading(false);
      }
    };

    void loadEpisode();

    return () => {
      active = false;
    };
  }, [episodeId, getEpisode]);

  const podcast = podcasts.find((item) => item.id === episode?.podcastId);
  const backTitle = (canGoBack ? previousPageTitle : undefined) ?? podcast?.title ?? t("What's New");
  const handleBack = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }

    if (podcast) {
      void navigate({
        params: { podcastId: podcast.id },
        to: "/podcast/$podcastId",
        replace: true,
      });
      return;
    }

    void navigate({ to: "/whats-new", replace: true });
  };

  if (isLoading) {
    return <EpisodePageSkeleton />;
  }

  if (!episode) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center px-6 text-center">
        <div>
          <p className="font-medium">{t("Episode unavailable")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("It may have been removed from the podcast feed.")}</p>
          <Button className="mt-4" onClick={handleBack} size="sm">
            {t("Back to {name}", { name: backTitle })}
          </Button>
        </div>
      </div>
    );
  }

  const progress = playbackProgress.get(episode.id);
  const showNotes = episode.showNotes || episode.content || episode.description;

  const handleSeek = (seconds: number) => {
    if (currentEpisodeId !== episode.id) {
      playEpisode(episode);
      queueMicrotask(() => usePodcastStore.getState().seekToTime(seconds));
      return;
    }

    seekToTime(seconds);
  };

  return (
    <article className="mx-auto max-w-4xl pb-12 pt-5">
      <PageNavigation backLabel={backTitle} onBack={handleBack} />

      <ContentDetailsHeader
        actions={
          <EpisodeActionsMenu
            currentEpisodeId={currentEpisodeId}
            episode={episode}
            onOpenChange={setActionsOpen}
            open={actionsOpen}
          />
        }
        artworkAlt={episode.title}
        artworkSrc={episode.imageUrl || podcast?.imageUrl}
        controls={
          <EpisodePlaybackButton episode={episode} onPlay={playEpisode} progress={progress} />
        }
        metadataItems={[formatEpisodeDate(episode.publishedAt)]}
        title={episode.title}
      />

      <div className="px-2 pt-6">
        {showNotes ? (
          <ShowNotesReader content={showNotes} onSeek={handleSeek} />
        ) : (
          <p className="py-10 text-sm text-muted-foreground">No notes for this episode.</p>
        )}
      </div>
    </article>
  );
}

function EpisodePageSkeleton() {
  useLocale();
  return (
    <div className="mx-auto max-w-4xl pb-12 pt-5">
      <div className="mb-1 px-2">
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>
      <div className="flex min-w-0 items-start gap-5 border-b border-border/60 px-2 py-5 md:gap-6">
        <Skeleton className="size-32 shrink-0 rounded-lg md:size-36" />
        <div className="flex min-h-32 min-w-0 flex-1 flex-col justify-center gap-2 md:min-h-36">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-7 w-36 rounded-md" />
        </div>
      </div>
      <div className="space-y-3 px-2 pt-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
