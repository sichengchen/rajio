import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { type ReactNode, useEffect, useState } from "react";
import { CircleCheck, Download, Ellipsis, Heart, ListPlus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePodcastStore } from "@/lib/store";
import type { Episode } from "@/lib/types";

interface EpisodeActionProps {
  currentEpisodeId?: string;
  episode: Episode;
  onDeleteComplete?: () => void | Promise<void>;
  onDownloadComplete?: () => void | Promise<void>;
}

interface EpisodeActionsMenuProps extends EpisodeActionProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface EpisodeActionsContextMenuProps extends EpisodeActionProps {
  children: ReactNode;
}

function useEpisodeActions({ episode, onDeleteComplete, onDownloadComplete }: EpisodeActionProps) {
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(Boolean(episode.isDownloaded));
  const [isDownloading, setIsDownloading] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const addToQueue = usePodcastStore((state) => state.addToQueue);
  const deleteDownload = usePodcastStore((state) => state.deleteDownload);
  const downloadEpisode = usePodcastStore((state) => state.downloadEpisode);
  const isFavorite = usePodcastStore((state) =>
    state.favoriteEpisodes.some((favoriteEpisode) => favoriteEpisode.id === episode.id),
  );
  const isListened = usePodcastStore(
    (state) => state.playbackProgress.get(episode.id)?.isCompleted ?? false,
  );
  const setEpisodeListened = usePodcastStore((state) => state.setEpisodeListened);
  const toggleFavoriteEpisode = usePodcastStore((state) => state.toggleFavoriteEpisode);

  useEffect(() => {
    setIsDownloaded(Boolean(episode.isDownloaded));
  }, [episode.isDownloaded]);

  const handleListenedChange = async (listened: boolean) => {
    try {
      await setEpisodeListened(episode, listened);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to update listened status"));
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadFailed(false);
    try {
      await downloadEpisode(episode);
      setIsDownloaded(true);
      await onDownloadComplete?.();
      toast.success(t("Episode downloaded"));
    } catch (error) {
      setDownloadFailed(true);
      toast.error(error instanceof Error ? error.message : t("Failed to download episode"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRemoveDownload = async () => {
    try {
      await deleteDownload(episode.id);
      setIsDownloaded(false);
      setRemoveDialogOpen(false);
      await onDeleteComplete?.();
      toast.success(t("Download removed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to remove download"));
    }
  };

  return {
    downloadFailed,
    handleDownload,
    handleListenedChange,
    handlePlayNext: () => addToQueue(episode),
    handleRemoveDownload,
    isDownloaded,
    isDownloading,
    isFavorite,
    isListened,
    removeDialogOpen,
    setRemoveDialogOpen,
    toggleFavoriteEpisode: () => toggleFavoriteEpisode(episode),
  };
}

type EpisodeActionsState = ReturnType<typeof useEpisodeActions>;

function EpisodeMenuItems({
  actions,
  context = false,
  currentEpisodeId,
  episode,
}: {
  actions: EpisodeActionsState;
  context?: boolean;
  currentEpisodeId?: string;
  episode: Episode;
}) {
  useLocale();
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const CheckboxItem = context ? ContextMenuCheckboxItem : DropdownMenuCheckboxItem;
  const Group = context ? ContextMenuGroup : DropdownMenuGroup;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;

  return (
    <>
      <Group>
        <Item disabled={currentEpisodeId === episode.id} onSelect={actions.handlePlayNext}>
          <ListPlus />{t("Play Next")}</Item>
        <Item onSelect={actions.toggleFavoriteEpisode}>
          <Heart className={actions.isFavorite ? "fill-current" : undefined} />
          {actions.isFavorite ? t("Remove from Favorites") : t("Save to Favorites")}
        </Item>
        <CheckboxItem
          checked={actions.isListened}
          onCheckedChange={(checked) => void actions.handleListenedChange(checked)}
        >
          <CircleCheck />{t("Listened")}</CheckboxItem>
      </Group>
      <Separator />
      <Group>
        {actions.isDownloaded ? (
          <Item onSelect={() => actions.setRemoveDialogOpen(true)}>
            <Trash2 />{t("Remove Download")}</Item>
        ) : (
          <Item disabled={actions.isDownloading} onSelect={() => void actions.handleDownload()}>
            {actions.downloadFailed ? <RotateCcw /> : <Download />}
            {actions.isDownloading
              ? "Downloading…"
              : actions.downloadFailed
                ? t("Retry Download")
                : t("Download")}
          </Item>
        )}
      </Group>
    </>
  );
}

function RemoveDownloadDialog({ actions }: { actions: EpisodeActionsState }) {
  useLocale();
  return (
    <AlertDialog onOpenChange={actions.setRemoveDialogOpen} open={actions.removeDialogOpen}>
      <AlertDialogContent onClick={(event) => event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Remove this download?")}</AlertDialogTitle>
          <AlertDialogDescription>{t("The episode will remain in your library and can be downloaded again later.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void actions.handleRemoveDownload();
            }}
          >{t("Remove")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EpisodeActionsMenu({
  currentEpisodeId,
  episode,
  onDeleteComplete,
  onDownloadComplete,
  onOpenChange,
  open,
}: EpisodeActionsMenuProps) {
  useLocale();
  const actions = useEpisodeActions({ episode, onDeleteComplete, onDownloadComplete });

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange} open={open}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("More actions for {name}", { name: episode.title })}
            className="size-7 text-muted-foreground opacity-70 group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:opacity-100"
            size="icon"
            title={t("More actions for {name}", { name: episode.title })}
            type="button"
            variant="ghost"
          >
            <Ellipsis data-icon="inline-start" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <EpisodeMenuItems
            actions={actions}
            currentEpisodeId={currentEpisodeId}
            episode={episode}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <RemoveDownloadDialog actions={actions} />
    </>
  );
}

export function EpisodeActionsContextMenu({
  children,
  currentEpisodeId,
  episode,
  onDeleteComplete,
  onDownloadComplete,
}: EpisodeActionsContextMenuProps) {
  useLocale();
  const actions = useEpisodeActions({ episode, onDeleteComplete, onDownloadComplete });

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <EpisodeMenuItems
            actions={actions}
            context
            currentEpisodeId={currentEpisodeId}
            episode={episode}
          />
        </ContextMenuContent>
      </ContextMenu>
      <RemoveDownloadDialog actions={actions} />
    </>
  );
}
