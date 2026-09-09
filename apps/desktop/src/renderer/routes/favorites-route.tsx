import { t } from "../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { useEffect } from "react";

import { FavoritesPage } from "@/components/pages/favorites";
import { usePodcastStore } from "@/lib/store";
import { AppPageLayout, RequireSubscriptions } from "@/routes/content-layout";

export function FavoritesRoutePage() {
  useLocale();
  const setCurrentPage = usePodcastStore((state) => state.setCurrentPage);

  useEffect(() => {
    setCurrentPage("favorites");
  }, [setCurrentPage]);

  return (
    <RequireSubscriptions>
      <AppPageLayout backTo="/library" title={t("Favorites")}>
        <FavoritesPage />
      </AppPageLayout>
    </RequireSubscriptions>
  );
}
