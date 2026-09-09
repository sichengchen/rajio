import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import {
  List,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemMeta,
  ListItemTitle,
  ListItemTrailing,
} from "@/components/ui-custom/list";
import { CoverImage } from "@/components/ui/cover-image";

export interface PodcastListPodcast {
  id: string;
  title: string;
  author?: string;
  description?: string;
  imageUrl?: string;
}

interface PodcastListProps<TPodcast extends PodcastListPodcast> {
  getDescription?: (podcast: TPodcast) => ReactNode;
  getKey?: (podcast: TPodcast) => string;
  getMeta?: (podcast: TPodcast) => ReactNode;
  onOpen?: (podcast: TPodcast) => void;
  podcasts: TPodcast[];
  renderActions?: (podcast: TPodcast) => ReactNode;
}

export function PodcastList<TPodcast extends PodcastListPodcast>({
  getDescription = (podcast) => podcast.author || podcast.description || t("Podcast"),
  getKey = (podcast) => podcast.id,
  getMeta = () => t("Podcast"),
  onOpen,
  podcasts,
  renderActions,
}: PodcastListProps<TPodcast>) {
  useLocale();
  const handleKeyDown = (podcast: TPodcast, event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onOpen(podcast);
  };

  return (
    <List className="px-0">
      {podcasts.map((podcast) => {
        const actions = renderActions?.(podcast);
        const trailing = actions ?? (
          onOpen ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          ) : null
        );

        return (
          <ListItem
            className="group px-3 py-3"
            interactive={Boolean(onOpen)}
            key={getKey(podcast)}
            onClick={onOpen ? () => onOpen(podcast) : undefined}
            onKeyDown={(event) => handleKeyDown(podcast, event)}
            role={onOpen ? "button" : undefined}
          >
            <ListItemLeading>
              <CoverImage
                alt={t("{name} cover", { name: podcast.title })}
                className="h-14 w-14 rounded-md"
                loading="lazy"
                src={podcast.imageUrl}
              />
            </ListItemLeading>

            <ListItemContent className="min-w-0">
              <ListItemMeta>{getMeta(podcast)}</ListItemMeta>
              <ListItemTitle className="line-clamp-1 text-base">{podcast.title}</ListItemTitle>
              <ListItemDescription className="line-clamp-1">
                {getDescription(podcast)}
              </ListItemDescription>
            </ListItemContent>

            {actions ? (
              <ListItemActions>{actions}</ListItemActions>
            ) : trailing ? (
              <ListItemTrailing>{trailing}</ListItemTrailing>
            ) : null}
          </ListItem>
        );
      })}
    </List>
  );
}
