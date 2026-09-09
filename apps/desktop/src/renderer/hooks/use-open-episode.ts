import { t } from "../../shared/i18n";
import { useRouter } from "@tanstack/react-router";

import { usePodcastStore } from "@/lib/store";

const pageTitles = (): Record<string, string> => ({
  "/whats-new": t("What's New"),
  "/search": t("Search"),
  "/library": t("Library"),
  "/downloaded": t("Downloaded"),
  "/favorites": t("Favorites"),
  "/settings": t("Settings"),
});

declare module "@tanstack/react-router" {
  interface HistoryState {
    previousPageTitle?: string;
  }
}

export function useOpenEpisode() {
  const router = useRouter();

  return async (episodeId: string) => {
    const { pathname } = router.state.location;
    const store = usePodcastStore.getState();
    const [, kind, encodedId] = pathname.split("/");
    const id = encodedId ? decodeURIComponent(encodedId) : undefined;
    if (kind === "episode" && id === episodeId) return;

    const previousPageTitle =
      kind === "podcast"
        ? store.podcasts.find((podcast) => podcast.id === id)?.title
        : kind === "episode" && id
          ? (await store.getEpisode(id))?.title
          : pageTitles()[pathname];

    await router.navigate({
      to: "/episode/$episodeId",
      params: { episodeId },
      state: { previousPageTitle },
    });
  };
}
