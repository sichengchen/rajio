import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { useEffect } from "react";
import { AppPageLayout, RequireSubscriptions } from "@/routes/content-layout";
import { WhatsNewPage } from "@/components/pages/whats-new";
import { usePodcastStore } from "@/lib/store";

export function WhatsNewRoutePage() {
  useLocale();
  const setCurrentPage = usePodcastStore((state) => state.setCurrentPage);

  useEffect(() => {
    setCurrentPage("whats-new");
  }, [setCurrentPage]);

  return (
    <RequireSubscriptions>
      <AppPageLayout title={t("What's New")}>
        <WhatsNewPage />
      </AppPageLayout>
    </RequireSubscriptions>
  );
}
