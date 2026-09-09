"use client";

import { useEffect } from "react";
import { desktopApi } from "@/desktop-api";
import { usePodcastStore } from "@/lib/store";

export function AppInitializer() {
  const initializeStore = usePodcastStore((state) => state.initializeStore);

  useEffect(() => {
    void initializeStore();
    return desktopApi.library.onChanged?.(() => {
      void initializeStore(true);
    });
  }, [initializeStore]);

  useEffect(() => {
    const update = (status: import("../../../shared/types").DownloadStatus) => {
      if (status.status === "queued" || status.status === "missing") return;
      usePodcastStore.getState().updateDownloadProgress(status.episodeId, {
        episodeId: status.episodeId,
        progress: status.progress,
        error: status.error,
        startedAt: new Date(),
        status: status.status === "downloaded" ? "completed" : status.status,
      });
    };
    void desktopApi.downloads.statuses?.().then((statuses) => statuses.forEach(update));
    return desktopApi.downloads.onChanged?.(update);
  }, []);

  return null; // This component doesn't render anything
}
