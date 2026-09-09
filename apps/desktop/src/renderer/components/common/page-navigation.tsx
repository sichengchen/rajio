import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
import { BackNavigation } from "@/components/common/back-navigation";

export function PageNavigation({ backLabel, onBack }: { backLabel: string; onBack: () => void }) {
  useLocale();
  return (
    <nav
      aria-label={t("Page navigation")}
      className="app-no-drag sticky top-0 z-30 mb-1 flex h-12 min-w-0 items-center bg-background/95 px-2 backdrop-blur-sm"
    >
      <BackNavigation className="-ml-2" label={backLabel} onClick={onBack} />
    </nav>
  );
}
