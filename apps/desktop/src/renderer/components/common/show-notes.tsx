import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { DesktopSafeScrollArea } from "@/components/common/desktop-safe-scroll-area";
import { PlayerPanelHeader } from "@/components/common/player-panel-header";
import { ShowNotesReader } from "@/components/common/show-notes-reader";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePodcastStore } from "@/lib/store";

export function ShowNotes() {
  useLocale();
  const currentEpisode = usePodcastStore((state) => state.playbackState.currentEpisode);
  const seekToTime = usePodcastStore((state) => state.seekToTime);
  const isMobile = useIsMobile();
  const content =
    currentEpisode?.showNotes || currentEpisode?.content || currentEpisode?.description || "";

  const notesContent = content ? (
    <ShowNotesReader content={content} onSeek={seekToTime} />
  ) : (
    <ShowNotesEmptyState hasEpisode={Boolean(currentEpisode)} />
  );

  return (
    <section className="app-no-drag flex h-full min-w-0 flex-col bg-background">
      <PlayerPanelHeader title={t("Show Notes")} />
      {isMobile ? (
        <div
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-8 pt-7"
          style={{
            paddingBottom: currentEpisode ? "calc(6rem + env(safe-area-inset-bottom))" : "0",
          }}
        >
          {notesContent}
        </div>
      ) : (
        <DesktopSafeScrollArea className="flex-1" contentClassName="px-6 pb-12 pt-7">
          {notesContent}
        </DesktopSafeScrollArea>
      )}
    </section>
  );
}

function ShowNotesEmptyState({ hasEpisode }: { hasEpisode: boolean }) {
  useLocale();
  return (
    <div className="flex min-h-56 items-center justify-center px-6 text-center">
      <div className="max-w-56">
        <p className="text-sm font-medium text-foreground">
          {hasEpisode ? t("No notes for this episode") : t("Nothing playing")}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {hasEpisode
            ? t("You can still listen using the player below.")
            : t("Play an episode to read along.")}
        </p>
      </div>
    </div>
  );
}
