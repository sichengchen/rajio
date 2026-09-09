import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePodcastStore } from "@/lib/store";
import { WelcomeScreen } from "@/components/common/welcome";
import { PodcastEpisodes } from "@/components/pages/podcast/episodes";
import { PodcastDetails } from "@/components/pages/podcast/podcast-details";
import { PodcastActionsMenu, RemovePodcastDialog } from "@/components/common/podcast-actions-menu";
import { AppPageLayout, RequireSubscriptions } from "@/routes/content-layout";
import type { Episode } from "@/lib/types";

const emptyEpisodes: Episode[] = [];

export function PodcastRoutePage({ podcastId }: { podcastId: string }) {
  useLocale();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const podcasts = usePodcastStore((state) => state.podcasts);
  const podcastEpisodes = usePodcastStore(
    (state) => state.episodeCache.get(podcastId) ?? emptyEpisodes,
  );
  const pageState = usePodcastStore((state) => state.episodePageState.get(podcastId));
  const setCurrentPage = usePodcastStore((state) => state.setCurrentPage);
  const setSelectedPodcast = usePodcastStore((state) => state.setSelectedPodcast);
  const isRefreshing = usePodcastStore((state) => state.isRefreshing);
  const refreshPodcast = usePodcastStore((state) => state.refreshPodcast);
  const playEpisode = usePodcastStore((state) => state.playEpisode);
  const unsubscribeFromPodcast = usePodcastStore((state) => state.unsubscribeFromPodcast);

  const podcast = podcasts.find((item) => item.id === podcastId);

  useEffect(() => {
    setCurrentPage("podcasts");
    setSelectedPodcast(podcastId);
  }, [podcastId, setCurrentPage, setSelectedPodcast]);

  const handleRefresh = async () => {
    if (!podcast) return;

    try {
      await refreshPodcast(podcast.id);
      toast.success(t("Updated {name}", { name: podcast.title }));
    } catch {
      toast.error(t("Failed to update {name}", { name: podcast.title }));
    }
  };

  const handleRemove = async () => {
    if (!podcast) return;

    setIsRemoving(true);
    try {
      await unsubscribeFromPodcast(podcast.id);
      setRemoveDialogOpen(false);
      const nextPodcast = usePodcastStore.getState().podcasts[0];
      if (nextPodcast) {
        navigate({ params: { podcastId: nextPodcast.id }, to: "/podcast/$podcastId" });
      } else {
        navigate({ to: "/whats-new" });
      }
      toast.success(t("Removed {name}", { name: podcast.title }));
    } catch {
      toast.error(t("Failed to remove {name}", { name: podcast.title }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <RequireSubscriptions>
      <AppPageLayout
        centered={!podcast}
        backTo="/library"
        title={isMobile ? podcast?.title : undefined}
      >
        {podcast ? (
          <div className="mx-auto max-w-4xl">
            <PodcastDetails
              actions={
                <PodcastActionsMenu
                  isRefreshing={isRefreshing}
                  onOpenChange={setActionsOpen}
                  onRefresh={() => void handleRefresh()}
                  onRequestRemove={() => setRemoveDialogOpen(true)}
                  open={actionsOpen}
                  podcastTitle={podcast.title}
                />
              }
              episodes={podcastEpisodes}
              isLoadingEpisodes={Boolean(!pageState?.loaded)}
              onPlayLatest={playEpisode}
              podcast={podcast}
            />
            <PodcastEpisodes podcastId={podcastId} />
            <RemovePodcastDialog
              isRemoving={isRemoving}
              onConfirm={handleRemove}
              onOpenChange={(open) => {
                if (!open && !isRemoving) setRemoveDialogOpen(false);
              }}
              podcast={removeDialogOpen ? podcast : null}
            />
          </div>
        ) : (
          <WelcomeScreen />
        )}
      </AppPageLayout>
    </RequireSubscriptions>
  );
}
