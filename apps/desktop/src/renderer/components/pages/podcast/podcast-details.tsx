import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { type ReactNode, useMemo } from "react";
import { Info, Play } from "lucide-react";
import { ContentMetadata } from "@/components/common/content-metadata";
import { ContentDetailsHeader } from "@/components/common/content-details-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatEpisodeDate } from "@/lib/utils";
import type { Episode, Podcast } from "@/lib/types";
import { richTextToPlainText } from "@/lib/utils";

interface PodcastDetailsProps {
  actions?: ReactNode;
  episodes: Episode[];
  isLoadingEpisodes?: boolean;
  onPlayLatest: (episode: Episode) => void;
  podcast: Podcast;
}

export function PodcastDetails({
  actions,
  episodes,
  isLoadingEpisodes = false,
  onPlayLatest,
  podcast,
}: PodcastDetailsProps) {
  useLocale();
  const cleanDescription = richTextToPlainText(podcast.description);

  // Get the latest episode for this podcast
  const latestEpisode = useMemo(
    () =>
      [...episodes].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )[0],
    [episodes],
  );

  const updated = latestEpisode
    ? formatEpisodeDate(latestEpisode.publishedAt)
    : isLoadingEpisodes
      ? null
      : t("No episodes");

  return (
    <ContentDetailsHeader
      actions={actions}
      artworkAlt={podcast.title}
      artworkSrc={podcast.imageUrl}
      controls={
        latestEpisode || updated ? (
          <div className="flex items-center gap-2">
            {latestEpisode ? (
              <Button
                aria-label={t("Play latest episode: {name}", { name: latestEpisode.title })}
                onClick={() => onPlayLatest(latestEpisode)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Play className="size-3.5" data-icon="inline-start" fill="currentColor" />{t("Latest episode")}</Button>
            ) : null}
            {updated ? <ContentMetadata className="text-sm" items={[updated]} /> : null}
          </div>
        ) : null
      }
      metadataAction={
        cleanDescription ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button className="size-8 md:hidden" size="icon" variant="ghost">
                <Info className="size-4" />
                <span className="sr-only">{t("About this show")}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{podcast.title}</DialogTitle>
              </DialogHeader>
              <div className="max-h-96 overflow-y-auto">
                <DialogDescription className="whitespace-pre-wrap leading-relaxed">
                  {cleanDescription || t("No description available.")}
                </DialogDescription>
              </div>
            </DialogContent>
          </Dialog>
        ) : null
      }
      metadataItems={[podcast.author]}
      title={podcast.title}
    >
      {cleanDescription ? (
        <Dialog>
          <DialogTrigger
            aria-label={t("Show full description")}
            className="hidden max-w-3xl text-left text-sm leading-5 text-muted-foreground transition-colors hover:text-foreground md:line-clamp-2"
          >
            {cleanDescription}
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{podcast.title}</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              <DialogDescription className="whitespace-pre-wrap leading-6">
                {cleanDescription}
              </DialogDescription>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </ContentDetailsHeader>
  );
}
