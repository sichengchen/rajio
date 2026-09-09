import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePodcastStore } from "@/lib/store";
import type { Episode, PlaybackProgress } from "@/lib/types";
import { formatTime } from "@/lib/utils";

interface EpisodePlaybackButtonProps {
  episode: Episode;
  onPlay: (episode: Episode) => void;
  progress?: PlaybackProgress;
}

export function EpisodePlaybackButton({ episode, onPlay, progress }: EpisodePlaybackButtonProps) {
  useLocale();
  const isCurrentEpisode = usePodcastStore(
    (state) => state.playbackState.currentEpisode?.id === episode.id,
  );
  const isPlaying = usePodcastStore((state) =>
    state.playbackState.currentEpisode?.id === episode.id ? state.playbackState.isPlaying : false,
  );
  const currentTime = usePodcastStore((state) =>
    state.playbackState.currentEpisode?.id === episode.id ? state.playbackState.currentTime : 0,
  );
  const currentDuration = usePodcastStore((state) =>
    state.playbackState.currentEpisode?.id === episode.id ? state.playbackState.duration : 0,
  );
  const pausePlayback = usePodcastStore((state) => state.pausePlayback);
  const resumePlayback = usePodcastStore((state) => state.resumePlayback);

  const duration =
    (isCurrentEpisode ? currentDuration : 0) || progress?.duration || episode.duration || 0;
  const position = isCurrentEpisode ? currentTime : progress?.currentTime || 0;
  const hasProgress = duration > 0 && position > 0 && !progress?.isCompleted;
  const timeLabel = duration
    ? progress?.isCompleted
      ? formatTime(duration)
      : position > 0
        ? t("{time} remaining", { time: formatTime(Math.max(duration - position, 0)) })
        : formatTime(duration)
    : null;
  const action = isCurrentEpisode && isPlaying ? t("Pause") : t("Play");
  const visibleTimeLabel = hasProgress ? formatTime(Math.max(duration - position, 0)) : timeLabel;

  const handleClick = () => {
    if (!isCurrentEpisode) {
      onPlay(episode);
      return;
    }

    if (isPlaying) {
      pausePlayback();
      return;
    }

    resumePlayback();
  };

  return (
    <Button
      aria-label={`${action} ${episode.title}${timeLabel ? `, ${timeLabel}` : ""}`}
      aria-pressed={isCurrentEpisode && isPlaying}
      className={visibleTimeLabel ? "h-7 gap-1.5 px-2.5 text-xs leading-none" : "size-7"}
      onClick={handleClick}
      size={visibleTimeLabel ? "sm" : "icon"}
      title={action}
      type="button"
      variant="outline"
    >
      {isCurrentEpisode && isPlaying ? (
        <Pause className="size-3.5" data-icon="inline-start" fill="currentColor" />
      ) : (
        <Play className="size-3.5" data-icon="inline-start" fill="currentColor" />
      )}
      {hasProgress ? (
        <Progress
          aria-label={t("{percent}% played", { percent: Math.round((position / duration) * 100) })}
          className="h-1 w-8 bg-muted-foreground/25 [&_[data-slot=progress-indicator]]:bg-foreground"
          value={(position / duration) * 100}
        />
      ) : null}
      {visibleTimeLabel ? (
        <span className="tabular-nums leading-none">{visibleTimeLabel}</span>
      ) : null}
    </Button>
  );
}
