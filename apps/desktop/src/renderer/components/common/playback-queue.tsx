import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useState, type DragEvent } from "react";
import { ListX, X } from "lucide-react";

import { DesktopSafeScrollArea } from "@/components/common/desktop-safe-scroll-area";
import { PlayerPanelHeader } from "@/components/common/player-panel-header";
import {
  List,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
} from "@/components/ui-custom/list";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/ui/cover-image";
import type { QueueDropPlacement } from "@/lib/playback-queue";
import { usePodcastStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface QueueDropTarget {
  episodeId: string;
  placement: QueueDropPlacement;
}

export function PlaybackQueue() {
  useLocale();
  const playbackQueue = usePodcastStore((state) => state.playbackQueue);
  const clearQueue = usePodcastStore((state) => state.clearQueue);
  const playQueuedEpisode = usePodcastStore((state) => state.playQueuedEpisode);
  const removeFromQueue = usePodcastStore((state) => state.removeFromQueue);
  const reorderQueue = usePodcastStore((state) => state.reorderQueue);
  const currentEpisodeId = usePodcastStore((state) => state.playbackState.currentEpisode?.id);
  const [draggedEpisodeId, setDraggedEpisodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<QueueDropTarget | null>(null);
  const hasQueuedEpisodes = playbackQueue.some((episode) => episode.id !== currentEpisodeId);

  const handleDragOver = (event: DragEvent<HTMLDivElement>, episodeId: string) => {
    if (!draggedEpisodeId || draggedEpisodeId === episodeId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget({ episodeId, placement });
  };

  const resetDragState = () => {
    setDraggedEpisodeId(null);
    setDropTarget(null);
  };

  return (
    <section className="app-no-drag flex h-full min-w-0 flex-col bg-background">
      <PlayerPanelHeader
        actions={
          hasQueuedEpisodes ? (
            <Button
              aria-label={t("Clear play queue")}
              className="size-8 text-muted-foreground"
              onClick={clearQueue}
              size="icon"
              title={t("Clear play queue")}
              variant="ghost"
            >
              <ListX className="translate-x-px" />
            </Button>
          ) : null
        }
        title={t("Play Queue")}
      />

      {playbackQueue.length > 0 ? (
        <DesktopSafeScrollArea className="flex-1" contentClassName="px-3 py-2">
          <List>
            {playbackQueue.map((episode) => {
              const isCurrentEpisode = episode.id === currentEpisodeId;

              return (
                <ListItem
                  aria-current={isCurrentEpisode ? "true" : undefined}
                  aria-label={t("Play {name}", { name: episode.title })}
                  className={cn(
                    "rounded-md px-2 py-2.5 after:left-[3.75rem] after:right-2 hover:bg-muted/55",
                    !isCurrentEpisode && "cursor-grab active:cursor-grabbing",
                    dropTarget?.episodeId === episode.id &&
                      dropTarget.placement === "before" &&
                      "before:absolute before:inset-x-2 before:top-0 before:z-10 before:h-0.5 before:rounded-full before:bg-primary",
                    dropTarget?.episodeId === episode.id &&
                      dropTarget.placement === "after" &&
                      "before:absolute before:inset-x-2 before:bottom-0 before:z-10 before:h-0.5 before:rounded-full before:bg-primary",
                  )}
                  draggable={!isCurrentEpisode}
                  interactive
                  key={episode.id}
                  onDragEnd={resetDragState}
                  onDragOver={(event) => handleDragOver(event, episode.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", episode.id);
                    setDraggedEpisodeId(episode.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedEpisodeId && dropTarget) {
                      reorderQueue(draggedEpisodeId, dropTarget.episodeId, dropTarget.placement);
                    }
                    resetDragState();
                  }}
                  onClick={() => playQueuedEpisode(episode.id)}
                >
                  <ListItemLeading>
                    <CoverImage
                      alt={episode.title}
                      className="size-10 rounded-md"
                      loading="lazy"
                      src={episode.imageUrl}
                    />
                  </ListItemLeading>
                  <ListItemContent>
                    <ListItemTitle className="line-clamp-2 text-sm leading-5">
                      {episode.title}
                    </ListItemTitle>
                  </ListItemContent>
                  {isCurrentEpisode ? null : (
                    <ListItemActions className="ml-auto min-w-8 justify-end">
                      <Button
                        aria-label={t("Remove {name} from play queue", { name: episode.title })}
                        className="size-8 text-muted-foreground"
                        onClick={() => removeFromQueue(episode.id)}
                        size="icon"
                        title={t("Remove from play queue")}
                        variant="ghost"
                      >
                        <X data-icon="inline-start" />
                      </Button>
                    </ListItemActions>
                  )}
                </ListItem>
              );
            })}
          </List>
        </DesktopSafeScrollArea>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-56">
            <p className="text-sm font-medium">{t("Your queue is empty")}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("Play an episode or choose Play Next to add it here.")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
