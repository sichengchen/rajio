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

  return null; // This component doesn't render anything
}
