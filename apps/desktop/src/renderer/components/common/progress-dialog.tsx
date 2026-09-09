import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePodcastStore } from "@/lib/store";

export function ProgressDialog() {
  useLocale();
  const { progressDialog } = usePodcastStore();

  const progressPercentage =
    progressDialog.total > 0
      ? Math.round((progressDialog.progress / progressDialog.total) * 100)
      : 0;

  return (
    <Dialog open={progressDialog.isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{progressDialog.title}</DialogTitle>
          <DialogDescription>
            {progressDialog.currentItem && (
              <span className="text-sm text-muted-foreground">
                Processing: {progressDialog.currentItem}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t("Progress")}</span>
              <span>
                {progressDialog.progress} / {progressDialog.total}
              </span>
            </div>
            <Progress value={progressPercentage} className="w-full" />
            <div className="text-xs text-center text-muted-foreground">{progressPercentage}%</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
