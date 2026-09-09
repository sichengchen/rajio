import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { useEffect } from "react";
import { SettingsPage } from "@/components/pages/settings";
import { usePodcastStore } from "@/lib/store";
import { AppPageLayout } from "@/routes/content-layout";

export function SettingsRoutePage() {
  useLocale();
  const setCurrentPage = usePodcastStore((state) => state.setCurrentPage);

  useEffect(() => {
    setCurrentPage("settings");
  }, [setCurrentPage]);

  return (
    <AppPageLayout title={t("Settings")}>
      <SettingsPage />
    </AppPageLayout>
  );
}
