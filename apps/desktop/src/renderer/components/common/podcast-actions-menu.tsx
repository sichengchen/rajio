import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
("use client");

import type { ReactElement } from "react";
import { Ellipsis, RefreshCw, Trash2 } from "lucide-react";

import {
  AlertDialog,
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
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Podcast } from "@/lib/types";

interface PodcastActionProps {
  isRefreshing: boolean;
  onRefresh: () => void;
  onRequestRemove: () => void;
  podcastTitle: string;
}

interface PodcastActionsMenuProps extends PodcastActionProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface PodcastActionsContextMenuProps extends PodcastActionProps {
  children: ReactElement;
}

function PodcastActionItems({
  context = false,
  isRefreshing,
  onRefresh,
  onRequestRemove,
}: Omit<PodcastActionProps, "podcastTitle"> & { context?: boolean }) {
  useLocale();
  if (context) {
    return (
      <ContextMenuGroup>
        <ContextMenuItem disabled={isRefreshing} onClick={onRefresh}>
          <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
          {t("Update show")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onRequestRemove} variant="destructive">
          <Trash2 />
          {t("Remove from library")}
        </ContextMenuItem>
      </ContextMenuGroup>
    );
  }

  return (
    <DropdownMenuGroup>
      <DropdownMenuItem disabled={isRefreshing} onClick={onRefresh}>
        <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
        {t("Update show")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onRequestRemove} variant="destructive">
        <Trash2 />
        {t("Remove from library")}
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

export function PodcastActionsMenu({
  isRefreshing,
  onOpenChange,
  onRefresh,
  onRequestRemove,
  open,
  podcastTitle,
}: PodcastActionsMenuProps) {
  useLocale();
  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("More actions for {name}", { name: podcastTitle })}
            className="mr-1 size-7 shrink-0 text-muted-foreground opacity-70 group-hover/menu-item:opacity-100 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground data-popup-open:opacity-100"
            size="icon"
            title={t("More actions for {name}", { name: podcastTitle })}
            variant="ghost"
          >
            <Ellipsis data-icon="inline-start" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-44" side="right" sideOffset={6}>
        <PodcastActionItems
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          onRequestRemove={onRequestRemove}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PodcastActionsContextMenu({
  children,
  isRefreshing,
  onRefresh,
  onRequestRemove,
}: PodcastActionsContextMenuProps) {
  useLocale();
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-44">
        <PodcastActionItems
          context
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          onRequestRemove={onRequestRemove}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface RemovePodcastDialogProps {
  isRemoving: boolean;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  podcast: Podcast | null;
}

export function RemovePodcastDialog({
  isRemoving,
  onConfirm,
  onOpenChange,
  podcast,
}: RemovePodcastDialogProps) {
  useLocale();
  return (
    <AlertDialog onOpenChange={onOpenChange} open={podcast !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Remove this show from your library?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Remove “{name}” and its downloaded episodes from this device?", {
              name: podcast?.title ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>{t("Cancel")}</AlertDialogCancel>
          <Button
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isRemoving}
            onClick={() => void onConfirm()}
          >
            {isRemoving ? t("Removing...") : t("Remove")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
