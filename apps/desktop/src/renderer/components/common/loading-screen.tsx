import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { LoadingSpinner } from "@/components/common/loading-spinner";

export function LoadingScreen() {
  useLocale();
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mb-4 mx-auto" />
        <p className="text-muted-foreground">{t("Loading...")}</p>
      </div>
    </div>
  );
}
