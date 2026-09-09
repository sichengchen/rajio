import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useNavigate } from "@tanstack/react-router";
import { usePodcastStore } from "@/lib/store";
import { GridLayout, MediaCard } from "@/components/ui-custom/grid-layout";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

function LibraryContent() {
  useLocale();
  const navigate = useNavigate();
  const podcasts = usePodcastStore((state) => state.podcasts);
  const isMobile = useIsMobile();

  const handlePodcastClick = (podcastId: string) => {
    navigate({
      params: { podcastId },
      to: "/podcast/$podcastId",
    });
  };

  return (
    <div className="space-y-6 py-4">
      {/* Header buttons - only show on mobile */}
      {isMobile && (
        <div className="flex gap-3 px-2">
          <Button
            variant="outline"
            className="flex-1 h-12 justify-start gap-3"
            onClick={() => navigate({ to: "/downloaded" })}
          >
            <Download className="h-5 w-5" />
            <span>{t("Downloaded")}</span>
          </Button>
        </div>
      )}

      {/* Podcasts Grid */}
      <div className="px-2">
        {podcasts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t("No podcasts in your library yet")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("Add podcasts to start building your collection")}</p>
          </div>
        ) : (
          <GridLayout columns={2} gap={4}>
            {podcasts.map((podcast) => (
              <MediaCard
                key={podcast.id}
                title={podcast.title}
                subtitle={podcast.author}
                imageUrl={podcast.imageUrl}
                imageAlt={t("{name} cover", { name: podcast.title })}
                onClick={() => handlePodcastClick(podcast.id)}
                className="w-full"
              />
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}

export function LibraryPage() {
  useLocale();
  return <LibraryContent />;
}
