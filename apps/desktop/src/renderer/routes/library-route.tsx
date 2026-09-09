import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { useEffect } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";

import { LibraryPage } from "@/components/pages/library";
import { usePodcastStore } from "@/lib/store";
import { AppPageLayout, RequireSubscriptions } from "@/routes/content-layout";

export function LibraryRoutePage() {
  useLocale();
  const isRefreshing = usePodcastStore((state) => state.isRefreshing);
  const refreshAllPodcasts = usePodcastStore((state) => state.refreshAllPodcasts);
  const setCurrentPage = usePodcastStore((state) => state.setCurrentPage);
  const setShowAddPodcastDialog = usePodcastStore((state) => state.setShowAddPodcastDialog);

  useEffect(() => {
    setCurrentPage("library");
  }, [setCurrentPage]);

  return (
    <RequireSubscriptions>
      <AppPageLayout
        title={t("Library")}
        toolBar={[
          {
            disabled: isRefreshing,
            icon: <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />,
            label: t("Refresh podcasts"),
            onClick: async () => {
              try {
                await refreshAllPodcasts();
                toast.success(t("Podcasts refreshed successfully!"));
              } catch {
                toast.error(t("Failed to refresh podcasts"));
              }
            },
          },
          {
            icon: <Plus className="h-4 w-4" />,
            label: t("Add podcast"),
            onClick: () => setShowAddPodcastDialog(true),
          },
        ]}
      >
        <LibraryPage />
      </AppPageLayout>
    </RequireSubscriptions>
  );
}
