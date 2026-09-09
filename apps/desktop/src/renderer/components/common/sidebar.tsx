import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Radio, Search, Settings, Sparkles, Download, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CoverImage } from "@/components/ui/cover-image";
import { DesktopSafeScrollArea } from "@/components/common/desktop-safe-scroll-area";
import {
  PodcastActionsContextMenu,
  PodcastActionsMenu,
  RemovePodcastDialog,
} from "@/components/common/podcast-actions-menu";
import { usePodcastStore } from "@/lib/store";
import type { Podcast } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Menu items
const menuItems = () => [
  {
    title: t("Search"),
    icon: Search,
    to: "/search" as const,
  },
  {
    title: t("What's New"),
    icon: Sparkles,
    to: "/whats-new" as const,
  },
  {
    title: t("Downloaded"),
    icon: Download,
    to: "/downloaded" as const,
  },
  {
    title: t("Favorites"),
    icon: Heart,
    to: "/favorites" as const,
  },
  {
    title: t("Settings"),
    icon: Settings,
    to: "/settings" as const,
  },
];

export function PodcastSidebar() {
  useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const podcasts = usePodcastStore((state) => state.podcasts);
  const currentPage = usePodcastStore((state) => state.currentPage);
  const isLoading = usePodcastStore((state) => state.isLoading);
  const isRefreshing = usePodcastStore((state) => state.isRefreshing);
  const refreshPodcast = usePodcastStore((state) => state.refreshPodcast);
  const setSelectedPodcast = usePodcastStore((state) => state.setSelectedPodcast);
  const setShowAddPodcastDialog = usePodcastStore((state) => state.setShowAddPodcastDialog);
  const unsubscribeFromPodcast = usePodcastStore((state) => state.unsubscribeFromPodcast);
  const [actionsPodcastId, setActionsPodcastId] = useState<string | null>(null);
  const [podcastPendingRemoval, setPodcastPendingRemoval] = useState<Podcast | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const activePodcastId = location.pathname.startsWith("/podcast/")
    ? decodeURIComponent(location.pathname.replace("/podcast/", ""))
    : null;

  const handleRefreshPodcast = async (podcast: Podcast) => {
    try {
      await refreshPodcast(podcast.id);
      toast.success(t("Updated {name}", { name: podcast.title }));
    } catch {
      toast.error(t("Failed to update {name}", { name: podcast.title }));
    }
  };

  const handleRemovePodcast = async () => {
    const podcast = podcastPendingRemoval;
    if (!podcast) {
      return;
    }

    setIsRemoving(true);
    try {
      await unsubscribeFromPodcast(podcast.id);
      setPodcastPendingRemoval(null);

      if (activePodcastId === podcast.id) {
        const nextPodcast = usePodcastStore.getState().podcasts[0];
        if (nextPodcast) {
          navigate({ params: { podcastId: nextPodcast.id }, to: "/podcast/$podcastId" });
        } else {
          navigate({ to: "/whats-new" });
        }
      }

      toast.success(t("Removed {name}", { name: podcast.title }));
    } catch {
      toast.error(t("Failed to remove {name}", { name: podcast.title }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex flex-col gap-2 p-2 flex-shrink-0">
          <div className="app-drag h-7" />
        </div>

        <div className="app-no-drag flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Fixed sections */}
          <div className="flex-shrink-0">
            <div className="relative flex w-full min-w-0 flex-col p-2">
              <div className="text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium">{t("Menu")}</div>
              <div className="w-full text-sm">
                <ul className="flex w-full min-w-0 flex-col gap-1">
                  {menuItems().map((item) => {
                    const isEpisodeDetail = location.pathname.startsWith("/episode/");
                    const isActive =
                      location.pathname === item.to ||
                      (isEpisodeDetail &&
                        ((currentPage === "whats-new" && item.to === "/whats-new") ||
                          (currentPage === "downloaded" && item.to === "/downloaded") ||
                          (currentPage === "favorites" && item.to === "/favorites") ||
                          (currentPage === "settings" && item.to === "/settings")));

                    return (
                      <li key={item.to} className="group/menu-item relative">
                        <button
                          onClick={() =>
                            navigate({
                              to: item.to,
                            })
                          }
                          className={`flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                            isActive
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : ""
                          }`}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate flex-1 min-w-0">{item.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <Separator className="bg-sidebar-border mx-2 w-auto" />

            <div className="relative flex w-full min-w-0 flex-col p-2">
              <div className="flex items-center justify-between h-8 px-2 min-w-0">
                <div className="text-sidebar-foreground/70 ring-sidebar-ring p-0 flex-1 min-w-0 text-xs font-medium">
                  <span className="truncate">{t("Podcasts ({count})", { count: podcasts.length })}</span>
                </div>
                <div className="-mr-2.5 flex flex-shrink-0 gap-1">
                  <Button
                    onClick={() => setShowAddPodcastDialog(true)}
                    size="sm"
                    variant="ghost"
                    className="flex-shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="sr-only">{t("Add podcast")}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable podcasts list */}
          <DesktopSafeScrollArea
            className="flex-1"
            contentClassName="p-2 pt-0 pb-[var(--desktop-window-safe-area-block)]"
          >
            <div className="w-full text-sm">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground px-2">
                  <div className="h-6 w-6 mx-auto mb-4 animate-spin">
                    <div className="h-full w-full border-2 border-current border-t-transparent rounded-full" />
                  </div>
                  <p className="text-sm">{t("Loading podcasts...")}</p>
                </div>
              ) : podcasts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground px-2 min-w-0 max-w-full">
                  <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="truncate">{t("No podcasts yet")}</p>
                  <p className="text-sm truncate">{t("Add your first podcast to get started")}</p>
                </div>
              ) : (
                <ul className="flex w-full min-w-0 flex-col gap-1">
                  {podcasts.map((podcast) => {
                    const isActive = activePodcastId === podcast.id;
                    const isMenuOpen = actionsPodcastId === podcast.id;

                    return (
                      <PodcastActionsContextMenu
                        isRefreshing={isRefreshing}
                        key={podcast.id}
                        onRefresh={() => void handleRefreshPodcast(podcast)}
                        onRequestRemove={() => setPodcastPendingRemoval(podcast)}
                        podcastTitle={podcast.title}
                      >
                        <li
                          className={cn(
                            "group/menu-item relative flex min-w-0 items-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                          )}
                        >
                          <button
                            onClick={() => {
                              setSelectedPodcast(podcast.id);
                              navigate({
                                params: {
                                  podcastId: podcast.id,
                                },
                                to: "/podcast/$podcastId",
                              });
                            }}
                            className="flex h-auto min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden"
                          >
                            <div className="flex items-center gap-2 w-full min-w-0">
                              <CoverImage
                                src={podcast.imageUrl}
                                alt={podcast.title}
                                className="w-8 h-8 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0 text-left overflow-hidden">
                                <div className="font-medium text-sm truncate leading-tight">
                                  {podcast.title}
                                </div>
                                {podcast.author && (
                                  <div className="text-xs text-muted-foreground truncate leading-tight">
                                    {podcast.author}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                          <PodcastActionsMenu
                            isRefreshing={isRefreshing}
                            onOpenChange={(open) => setActionsPodcastId(open ? podcast.id : null)}
                            onRefresh={() => void handleRefreshPodcast(podcast)}
                            onRequestRemove={() => setPodcastPendingRemoval(podcast)}
                            open={isMenuOpen}
                            podcastTitle={podcast.title}
                          />
                        </li>
                      </PodcastActionsContextMenu>
                    );
                  })}
                </ul>
              )}
            </div>
          </DesktopSafeScrollArea>
        </div>
      </div>
      <RemovePodcastDialog
        isRemoving={isRemoving}
        onConfirm={handleRemovePodcast}
        onOpenChange={(open) => {
          if (!open && !isRemoving) {
            setPodcastPendingRemoval(null);
          }
        }}
        podcast={podcastPendingRemoval}
      />
    </>
  );
}
