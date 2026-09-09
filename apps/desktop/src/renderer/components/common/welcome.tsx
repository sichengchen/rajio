import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useRef } from "react";
import { Radio, Plus, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePodcastStore } from "@/lib/store";
import { toast } from "sonner";

export function WelcomeScreen() {
  useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { importFromOPML, progressDialog, setShowAddPodcastDialog } = usePodcastStore();

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await importFromOPML(text);

      if (result.imported > 0) {
        toast.success(t("Imported podcasts: {count}", { count: result.imported }));
        if (result.errors > 0) {
          toast.warning(
            t("Feeds unavailable or requiring access: {count}", { count: result.errors }),
          );
        }
      } else {
        toast.error(t("No podcasts were imported. Please check the OPML file format."));
      }
    } catch (error) {
      console.error("OPML import error:", error);
      toast.error(
        t("Failed to import OPML file: {error}", { error: error instanceof Error ? error.message : t("Unknown error") }),
      );
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center px-2 py-10">
      <section className="flex w-full max-w-sm flex-col gap-6" aria-labelledby="welcome-title">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-muted">
            <Radio className="size-7 text-foreground" />
          </div>
          <h1 id="welcome-title" className="text-2xl font-semibold tracking-tight">{t("Welcome to Rajio")}</h1>
        </header>
        <div className="flex flex-col gap-4 text-center">
          <p className="text-muted-foreground text-sm">{t("Rajio is a podcast player. Get started by adding your first podcast.")}</p>

          <div className="flex flex-col gap-2">
            <Button className="w-full" size="default" onClick={() => setShowAddPodcastDialog(true)}>
              <Plus data-icon="inline-start" />{t("Add Podcast")}</Button>

            <p className="text-sm text-muted-foreground mt-2">{t("Or import your subscriptions from an OPML file")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              size="default"
              variant="outline"
              onClick={handleImportClick}
              disabled={progressDialog.isOpen}
            >
              <Import data-icon="inline-start" />
              {progressDialog.isOpen ? t("Importing...") : t("Import OPML")}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </section>
    </div>
  );
}
