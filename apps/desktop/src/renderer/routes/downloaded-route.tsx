import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { useEffect } from "react";
import { DownloadedPage } from "@/components/pages/downloaded";
import { usePodcastStore } from "@/lib/store";
import { AppPageLayout, RequireSubscriptions } from "@/routes/content-layout";

export function DownloadedRoutePage() {
  useLocale();
  const setCurrentPage = usePodcastStore((state) => state.setCurrentPage);

  useEffect(() => {
    setCurrentPage("downloaded");
  }, [setCurrentPage]);

  return (
    <RequireSubscriptions>
      <AppPageLayout backTo="/library" title={t("Downloaded")}>
        <DownloadedPage />
      </AppPageLayout>
    </RequireSubscriptions>
  );
}
