import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import type { ReactNode } from "react";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { BackNavigation } from "@/components/common/back-navigation";
import { Button } from "@/components/ui/button";
import { MobileTabBar, type MobileTabBarItem } from "@/components/ui-custom/mobile-tab-bar";
import { AddPodcastDialog } from "@/components/common/add-podcast-dialog";
import { DesktopSafeScrollArea } from "@/components/common/desktop-safe-scroll-area";
import { WelcomeScreen } from "@/components/common/welcome";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePodcastStore } from "@/lib/store";
import { Radio, Search, Settings, Sparkles } from "lucide-react";

interface ToolbarAction {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
}

interface AppPageLayoutProps {
  backTo?: "/downloaded" | "/favorites" | "/library" | "/search" | "/settings" | "/whats-new";
  children: ReactNode;
  title?: string;
  toolBar?: ToolbarAction[];
}

const mobileTabItems = (): MobileTabBarItem[] => [
  {
    id: "search",
    icon: Search,
    label: t("Search"),
  },
  {
    id: "whats-new",
    icon: Sparkles,
    label: t("What's New"),
  },
  {
    id: "library",
    icon: Radio,
    label: t("Library"),
  },
  {
    id: "settings",
    icon: Settings,
    label: t("Settings"),
  },
];

function getActiveTab(pathname: string) {
  if (pathname.startsWith("/search")) {
    return "search";
  }

  if (pathname.startsWith("/settings")) {
    return "settings";
  }

  if (
    pathname.startsWith("/library") ||
    pathname.startsWith("/favorites") ||
    pathname.startsWith("/downloaded") ||
    pathname.startsWith("/episode/") ||
    pathname.startsWith("/podcast/")
  ) {
    return "library";
  }

  return "whats-new";
}

export function AppPageLayout({ backTo, children, title, toolBar }: AppPageLayoutProps) {
  useLocale();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const playbackState = usePodcastStore((state) => state.playbackState);
  const showAddPodcastDialog = usePodcastStore((state) => state.showAddPodcastDialog);
  const setShowAddPodcastDialog = usePodcastStore((state) => state.setShowAddPodcastDialog);

  const hasActiveEpisode = !!playbackState.currentEpisode;
  const pageContent = (
    <div className="app-drag mx-auto max-w-6xl px-4 py-3">
      {title ? (
        <div className="sticky top-0 z-30 -mx-4 mt-6 flex items-center gap-3 border-b border-border/60 bg-background/95 px-6 py-3 backdrop-blur-sm">
          {isMobile && backTo ? (
            <BackNavigation
              className="-ml-2"
              iconOnly
              label={t("Back")}
              onClick={() => navigate({ to: backTo })}
            />
          ) : null}

          <h1 className="flex-1 line-clamp-1 text-2xl font-bold">{title}</h1>

          {isMobile
            ? toolBar?.map((item) => (
                <Button
                  className="p-2"
                  disabled={item.disabled}
                  key={item.label}
                  onClick={item.onClick}
                  size="sm"
                  title={item.label}
                  variant="outline"
                >
                  {item.icon}
                  <span className="sr-only">{item.label}</span>
                </Button>
              ))
            : null}
        </div>
      ) : null}

      <div className="app-no-drag">{children}</div>
    </div>
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        {isMobile ? (
          <div
            data-page-scroll
            className="flex-1 overflow-y-auto"
            style={{
              paddingBottom: hasActiveEpisode
                ? "calc(10rem + env(safe-area-inset-bottom))"
                : "calc(4rem + env(safe-area-inset-bottom))",
            }}
          >
            {pageContent}
          </div>
        ) : (
          <DesktopSafeScrollArea className="flex-1">{pageContent}</DesktopSafeScrollArea>
        )}
      </div>

      {isMobile ? (
        <MobileTabBar
          activeTab={getActiveTab(location.pathname)}
          items={mobileTabItems()}
          onTabChange={(tabId) => {
            if (tabId === "search") {
              navigate({ to: "/search" });
              return;
            }

            if (tabId === "library") {
              navigate({ to: "/library" });
              return;
            }

            if (tabId === "settings") {
              navigate({ to: "/settings" });
              return;
            }

            navigate({ to: "/whats-new" });
          }}
          variant="default"
        />
      ) : null}

      <AddPodcastDialog onOpenChange={setShowAddPodcastDialog} open={showAddPodcastDialog} />
    </>
  );
}

export function RequireSubscriptions({ children }: { children: ReactNode }) {
  useLocale();
  const podcasts = usePodcastStore((state) => state.podcasts);

  if (podcasts.length === 0) {
    return (
      <AppPageLayout>
        <WelcomeScreen />
      </AppPageLayout>
    );
  }

  return <>{children}</>;
}
