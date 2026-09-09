import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePodcastStore } from "@/lib/store";
import { toast } from "sonner";

interface AddPodcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPodcastDialog({ open, onOpenChange }: AddPodcastDialogProps) {
  useLocale();
  const [feedUrl, setFeedUrl] = useState("");

  const { subscribeToPodcast, clearError, progressDialog } = usePodcastStore();

  const subscribeMutation = useMutation({
    mutationFn: async (url: string) => {
      clearError();
      await subscribeToPodcast(url);

      const currentState = usePodcastStore.getState();
      if (currentState.error) {
        throw new Error(currentState.error);
      }
    },
  });

  const isSubmitting = progressDialog.isOpen || subscribeMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedUrl.trim()) return;

    try {
      await subscribeMutation.mutateAsync(feedUrl.trim());
      setFeedUrl("");
      onOpenChange(false);
      toast.success(t("Podcast added successfully!"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to add podcast"));
    }
  };

  const handleClose = () => {
    setFeedUrl("");
    subscribeMutation.reset();
    clearError();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Add Podcast")}</DialogTitle>
          <DialogDescription>{t("Add a podcast by RSS feed URL.")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-4">
          <div>
            <Label htmlFor="feedUrl">{t("RSS Feed URL")}</Label>
            <Input
              id="feedUrl"
              type="url"
              placeholder="https://example.com/feed.xml"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              disabled={isSubmitting}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !feedUrl.trim()}>
              {isSubmitting ? t("Adding...") : t("Add Podcast")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
