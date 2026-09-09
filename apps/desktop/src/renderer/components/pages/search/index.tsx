import { t } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CircleOff,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EpisodeList } from "@/components/common/episode-list";
import { PodcastList } from "@/components/common/podcast-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { desktopApi } from "@/desktop-api";
import { iTunesService, type iTunesPodcast } from "@/lib/itunes-service";
import { usePodcastStore } from "@/lib/store";
import type { Episode, Podcast } from "@/lib/types";
import { richTextToPlainText } from "@/lib/utils";
import type { EpisodeSummary } from "../../../../shared/types";

type SearchSource = "discover" | "library";
type SearchFilter = "top" | "podcasts" | "episodes";

interface RankedPodcast {
  podcast: Podcast;
  score: number;
}

interface PodcastSearchEntry {
  normalizedAuthor: string;
  normalizedDescription: string;
  normalizedTitle: string;
  podcast: Podcast;
  titleWords: string[];
}

const resultRenderLimit = 75;
const emptyPodcastResults: RankedPodcast[] = [];
const emptyEpisodeResults: Episode[] = [];

const filters = (): Array<{ label: string; value: SearchFilter }> => [
  { label: t("Top Results"), value: "top" },
  { label: t("Podcasts"), value: "podcasts" },
  { label: t("Episodes"), value: "episodes" },
];

function normalizeSearchText(value: string | null | undefined) {
  return richTextToPlainText(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeFeedUrl(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function splitNormalizedWords(value: string) {
  return value ? value.split(/\s+/) : [];
}

function toSearchDate(value?: string) {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toSearchEpisode(episode: EpisodeSummary): Episode {
  return {
    audioUrl: episode.audioUrl,
    content: episode.content,
    description: episode.description ?? "",
    downloadedAt: episode.downloadedAt ? toSearchDate(episode.downloadedAt) : undefined,
    downloadedPath: episode.downloadedPath,
    duration: episode.duration,
    fileSize: episode.fileSize,
    guid: episode.guid,
    id: episode.id,
    imageUrl: episode.imageUrl,
    isDownloaded: Boolean(episode.downloadedPath),
    podcastId: episode.podcastId,
    publishedAt: toSearchDate(episode.publishedAt),
    showNotes: episode.content,
    title: episode.title,
  };
}

function titleMatchScore(normalizedTitle: string, titleWords: string[], query: string) {
  if (!normalizedTitle || !query) {
    return null;
  }

  if (normalizedTitle === query) {
    return 0;
  }

  if (normalizedTitle.startsWith(query)) {
    return 1;
  }

  if (titleWords.some((word) => word.startsWith(query))) {
    return 2;
  }

  if (normalizedTitle.includes(query)) {
    return 3;
  }

  return null;
}

function createPodcastSearchEntry(podcast: Podcast): PodcastSearchEntry {
  const normalizedTitle = normalizeSearchText(podcast.title);

  return {
    normalizedAuthor: normalizeSearchText(podcast.author),
    normalizedDescription: normalizeSearchText(podcast.description),
    normalizedTitle,
    podcast,
    titleWords: splitNormalizedWords(normalizedTitle),
  };
}

function podcastMatchScore(entry: PodcastSearchEntry, query: string) {
  const titleScore = titleMatchScore(entry.normalizedTitle, entry.titleWords, query);

  if (titleScore !== null) {
    return titleScore;
  }

  if (entry.normalizedAuthor.includes(query)) {
    return 4;
  }

  if (entry.normalizedDescription.includes(query)) {
    return 5;
  }

  return null;
}

function sortRankedPodcasts(a: RankedPodcast, b: RankedPodcast) {
  if (a.score !== b.score) {
    return a.score - b.score;
  }

  return a.podcast.title.localeCompare(b.podcast.title);
}

function getPodcastResults(
  query: string,
  podcasts: PodcastSearchEntry[],
) {
  if (!query) {
    return emptyPodcastResults;
  }

  return podcasts
    .map((entry) => {
      const score = podcastMatchScore(entry, query);
      return score === null ? null : { podcast: entry.podcast, score };
    })
    .filter((result): result is RankedPodcast => result !== null)
    .sort(sortRankedPodcasts);
}

function EmptyState({
  description,
  icon = <Search className="h-8 w-8" />,
  title,
}: {
  description?: string;
  icon?: ReactNode;
  title: string;
}) {
  useLocale();
  return (
    <div className="flex min-h-[280px] items-center justify-center px-4 py-12">
      <div className="max-w-sm text-center text-muted-foreground">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
        <p className="font-medium text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm">{description}</p> : null}
      </div>
    </div>
  );
}

function TruncatedResultsNote({
  hasMore = false,
  shownCount,
  totalCount,
}: {
  hasMore?: boolean;
  shownCount: number;
  totalCount: number;
}) {
  useLocale();
  return (
    <p className="px-4 py-3 text-xs text-muted-foreground">
      {t("Showing {shown} of {total} results. Narrow your search to see more.", { shown: shownCount, total: hasMore ? `${totalCount}+` : totalCount })}
    </p>
  );
}

export function SearchPage() {
  useLocale();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [submittedQueries, setSubmittedQueries] = useState<Record<SearchSource, string>>({
    discover: "",
    library: "",
  });
  const [activeSource, setActiveSource] = useState<SearchSource>("discover");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("top");
  const [discoverResults, setDiscoverResults] = useState<iTunesPodcast[]>([]);
  const [discoverTerm, setDiscoverTerm] = useState("");
  const [hasDiscoverSearched, setHasDiscoverSearched] = useState(false);
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const [isLibraryEpisodeSearching, setIsLibraryEpisodeSearching] = useState(false);
  const [libraryEpisodeResults, setLibraryEpisodeResults] =
    useState<Episode[]>(emptyEpisodeResults);
  const [libraryEpisodeResultsHaveMore, setLibraryEpisodeResultsHaveMore] = useState(false);
  const [libraryEpisodeTerm, setLibraryEpisodeTerm] = useState("");
  const [subscribingFeedUrl, setSubscribingFeedUrl] = useState<string | null>(null);
  const discoverRequestId = useRef(0);
  const libraryRequestId = useRef(0);

  const podcasts = usePodcastStore((state) => state.podcasts);
  const preferences = usePodcastStore((state) => state.preferences);
  const playbackProgress = usePodcastStore((state) => state.playbackProgress);
  const currentEpisodeId = usePodcastStore((state) => state.playbackState.currentEpisode?.id);
  const playEpisode = usePodcastStore((state) => state.playEpisode);
  const setSelectedPodcast = usePodcastStore((state) => state.setSelectedPodcast);
  const subscribeToPodcast = usePodcastStore((state) => state.subscribeToPodcast);

  const discoverEnabled = preferences.itunesSearchEnabled ?? true;
  const source: SearchSource = discoverEnabled ? activeSource : "library";
  const trimmedQuery = query.trim();
  const submittedQuery = submittedQueries[source];
  const currentTerm = trimmedQuery === submittedQuery ? submittedQuery.trim() : "";
  const currentDiscoverTerm = source === "discover" ? currentTerm : "";
  const shouldShowFilters = Boolean(currentTerm);
  const hasCurrentDiscoverResults =
    hasDiscoverSearched && currentDiscoverTerm === discoverTerm;
  const normalizedLibraryQuery =
    source === "library" ? normalizeSearchText(currentTerm) : "";
  const shouldSearchLibraryEpisodes =
    source === "library" && activeFilter !== "podcasts" && normalizedLibraryQuery !== "";

  useEffect(() => {
    if (!discoverEnabled && activeSource !== "library") {
      setActiveSource("library");
    }
  }, [activeSource, discoverEnabled]);

  useEffect(() => {
    if (!shouldSearchLibraryEpisodes) {
      setIsLibraryEpisodeSearching(false);
      setLibraryEpisodeResults(emptyEpisodeResults);
      setLibraryEpisodeResultsHaveMore(false);
      setLibraryEpisodeTerm("");
      return;
    }

    const requestId = libraryRequestId.current + 1;
    libraryRequestId.current = requestId;
    setIsLibraryEpisodeSearching(true);

    const timeout = window.setTimeout(() => {
      void desktopApi.episodes
        .search({
          limit: resultRenderLimit + 1,
          query: normalizedLibraryQuery,
        })
        .then((page) => {
          if (libraryRequestId.current !== requestId) {
            return;
          }

          setLibraryEpisodeResults(page.episodes.map(toSearchEpisode));
          setLibraryEpisodeResultsHaveMore(page.hasMore);
          setLibraryEpisodeTerm(normalizedLibraryQuery);
        })
        .catch((error) => {
          if (libraryRequestId.current !== requestId) {
            return;
          }

          setLibraryEpisodeResults(emptyEpisodeResults);
          setLibraryEpisodeResultsHaveMore(false);
          setLibraryEpisodeTerm(normalizedLibraryQuery);
          console.error("Failed to search library episodes:", error);
        })
        .finally(() => {
          if (libraryRequestId.current === requestId) {
            setIsLibraryEpisodeSearching(false);
          }
        });
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      if (libraryRequestId.current === requestId) {
        setIsLibraryEpisodeSearching(false);
      }
    };
  }, [normalizedLibraryQuery, shouldSearchLibraryEpisodes]);

  useEffect(() => {
    if (source !== "library" || activeFilter !== "podcasts") {
      return;
    }

    const requestId = libraryRequestId.current + 1;
    libraryRequestId.current = requestId;
    setLibraryEpisodeResults(emptyEpisodeResults);
    setLibraryEpisodeResultsHaveMore(false);
    setLibraryEpisodeTerm("");
    setIsLibraryEpisodeSearching(false);
  }, [activeFilter, source]);

  const subscribedFeedUrls = useMemo(
    () => new Set(podcasts.map((podcast) => normalizeFeedUrl(podcast.feedUrl))),
    [podcasts],
  );

  const podcastSearchIndex = useMemo(
    () => podcasts.map(createPodcastSearchEntry),
    [podcasts],
  );

  const filteredDiscoverResults = useMemo(
    () =>
      discoverResults.filter(
        (podcast) => !subscribedFeedUrls.has(normalizeFeedUrl(podcast.feedUrl)),
      ),
    [discoverResults, subscribedFeedUrls],
  );

  const libraryPodcastResults = useMemo(
    () =>
      source === "library"
        ? getPodcastResults(normalizedLibraryQuery, podcastSearchIndex)
        : emptyPodcastResults,
    [normalizedLibraryQuery, podcastSearchIndex, source],
  );
  const hasCurrentLibraryEpisodeResults = libraryEpisodeTerm === normalizedLibraryQuery;
  const currentLibraryEpisodeResults = hasCurrentLibraryEpisodeResults
    ? libraryEpisodeResults
    : emptyEpisodeResults;
  const currentLibraryEpisodeResultsHaveMore =
    hasCurrentLibraryEpisodeResults && libraryEpisodeResultsHaveMore;

  const getResultCount = (filter: SearchFilter) =>
    source === "discover"
      ? !hasCurrentDiscoverResults || filter === "episodes"
        ? 0
        : filteredDiscoverResults.length
      : filter === "episodes"
        ? currentLibraryEpisodeResults.length
        : filter === "podcasts"
          ? libraryPodcastResults.length
          : libraryPodcastResults.length + currentLibraryEpisodeResults.length;

  const activeResultCount = getResultCount(activeFilter);
  const shouldShowResultSummary =
    Boolean(currentTerm) &&
    (source !== "discover" || isDiscoverLoading || hasCurrentDiscoverResults);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const term = query.trim();
    setSubmittedQueries((current) => ({
      ...current,
      [source]: term,
    }));

    if (source !== "discover") {
      return;
    }

    if (!term) {
      setDiscoverResults([]);
      setDiscoverTerm("");
      setHasDiscoverSearched(false);
      return;
    }

    const requestId = discoverRequestId.current + 1;
    discoverRequestId.current = requestId;
    setDiscoverTerm(term);
    setHasDiscoverSearched(true);
    setIsDiscoverLoading(true);

    try {
      const response = await iTunesService.searchPodcasts(term, 20);

      if (discoverRequestId.current === requestId) {
        setDiscoverResults(response.results);
      }
    } catch (error) {
      if (discoverRequestId.current === requestId) {
        setDiscoverResults([]);
      }
      toast.error(error instanceof Error ? error.message : t("Failed to search Discover"));
      console.error("Discover search error:", error);
    } finally {
      if (discoverRequestId.current === requestId) {
        setIsDiscoverLoading(false);
      }
    }
  };

  const handleClearQuery = () => {
    setQuery("");
    setSubmittedQueries({
      discover: "",
      library: "",
    });
    setDiscoverResults([]);
    setDiscoverTerm("");
    setHasDiscoverSearched(false);
  };

  const handleSubscribe = async (podcast: iTunesPodcast) => {
    if (!podcast.feedUrl) {
      toast.error(t("This podcast does not have a valid RSS feed URL"));
      return;
    }

    setSubscribingFeedUrl(podcast.feedUrl);

    try {
      await subscribeToPodcast(podcast.feedUrl);
      toast.success(t("Subscribed to {name}", { name: podcast.title }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to subscribe to podcast"));
      console.error("Subscribe error:", error);
    } finally {
      setSubscribingFeedUrl(null);
    }
  };

  const handleOpenPodcast = (podcastId: string) => {
    setSelectedPodcast(podcastId);
    navigate({
      params: { podcastId },
      to: "/podcast/$podcastId",
    });
  };

  const handleOpenDiscoverPodcast = (podcast: iTunesPodcast) => {
    if (!podcast.itunesUrl) {
      return;
    }

    window.open(podcast.itunesUrl, "_blank", "noopener,noreferrer");
  };

  const renderDiscoverContent = (filter: SearchFilter) => {
    if (!currentTerm) {
      return <EmptyState title={t("Search Discover")} />;
    }

    if (isDiscoverLoading) {
      return (
        <EmptyState
          icon={<Loader2 className="h-8 w-8 animate-spin" />}
          title={t("Searching Discover")}
        />
      );
    }

    if (!hasCurrentDiscoverResults) {
      return <EmptyState title={t("Search Discover")} />;
    }

    if (filter === "episodes") {
      return (
        <EmptyState
          icon={<CircleOff className="h-8 w-8" />}
          title={t("No Discover episodes")}
        />
      );
    }

    if (filteredDiscoverResults.length === 0) {
      return <EmptyState title={t("No new podcasts found")} />;
    }

    const visibleDiscoverResults = filteredDiscoverResults.slice(0, resultRenderLimit);

    return (
      <>
        <PodcastList
          getDescription={(podcast) =>
            [podcast.author, podcast.genre].filter(Boolean).join(" · ") || t("Discover")
          }
          getKey={(podcast) => `${podcast.id}-${podcast.feedUrl}`}
          onOpen={handleOpenDiscoverPodcast}
          podcasts={visibleDiscoverResults}
          renderActions={(podcast) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("Subscribe to {name}", { name: podcast.title })}
                  disabled={subscribingFeedUrl === podcast.feedUrl}
                  onClick={() => void handleSubscribe(podcast)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {subscribingFeedUrl === podcast.feedUrl ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Subscribe</TooltipContent>
            </Tooltip>
          )}
        />
        {filteredDiscoverResults.length > visibleDiscoverResults.length ? (
          <TruncatedResultsNote
            shownCount={visibleDiscoverResults.length}
            totalCount={filteredDiscoverResults.length}
          />
        ) : null}
      </>
    );
  };

  const renderLibraryContent = (filter: SearchFilter) => {
    if (!currentTerm) {
      return <EmptyState title={t("Search your library")} />;
    }

    const tabResultCount = getResultCount(filter);

    if (tabResultCount === 0 && isLibraryEpisodeSearching) {
      return (
        <EmptyState
          icon={<Loader2 className="h-8 w-8 animate-spin" />}
          title={t("Searching your library")}
        />
      );
    }

    if (tabResultCount === 0) {
      return <EmptyState title={t("No library matches")} />;
    }

    const visiblePodcasts =
      filter === "episodes"
        ? []
        : libraryPodcastResults.slice(0, resultRenderLimit);
    const remainingEpisodeSlots =
      filter === "top"
        ? Math.max(resultRenderLimit - visiblePodcasts.length, 0)
        : resultRenderLimit;
    const visibleEpisodes =
      filter === "podcasts"
        ? []
        : currentLibraryEpisodeResults.slice(0, remainingEpisodeSlots);
    const shownResultCount = visiblePodcasts.length + visibleEpisodes.length;
    const hasHiddenResults =
      tabResultCount > shownResultCount ||
      ((filter === "top" || filter === "episodes") && currentLibraryEpisodeResultsHaveMore);

    return (
      <>
        {visiblePodcasts.length > 0 ? (
          <PodcastList
            getDescription={(podcast) =>
              podcast.author || richTextToPlainText(podcast.description) || t("Subscribed podcast")
            }
            onOpen={(podcast) => handleOpenPodcast(podcast.id)}
            podcasts={visiblePodcasts.map(({ podcast }) => podcast)}
          />
        ) : null}

        {visibleEpisodes.length > 0 ? (
          <EpisodeList
            currentEpisodeId={currentEpisodeId}
            episodes={visibleEpisodes}
            isLoadingEpisodes={false}
            playbackProgress={playbackProgress}
            playEpisode={playEpisode}
          />
        ) : null}

        {hasHiddenResults ? (
          <TruncatedResultsNote
            hasMore={(filter === "top" || filter === "episodes") && currentLibraryEpisodeResultsHaveMore}
            shownCount={shownResultCount}
            totalCount={tabResultCount}
          />
        ) : null}
      </>
    );
  };

  const renderResultsContent = (filter: SearchFilter) =>
    source === "discover" ? renderDiscoverContent(filter) : renderLibraryContent(filter);

  return (
    <div className="py-4">
      <Tabs
        className="flex min-w-0 flex-col gap-5"
        onValueChange={(value) => setActiveFilter(value as SearchFilter)}
        value={activeFilter}
      >
        <div className="flex w-full min-w-0 flex-col gap-3 px-4 pt-3">
          <form
            className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
            onSubmit={handleSubmit}
          >
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="h-10 bg-background pl-9 pr-10"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search in {source}", { source: source === "discover" ? t("Discover") : t("Library") })}
                value={query}
              />
              {query ? (
                <Button
                  aria-label={t("Clear search")}
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  onClick={handleClearQuery}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            {discoverEnabled ? (
              <Tabs
                className="min-w-0 justify-self-end"
                onValueChange={(value) => setActiveSource(value as SearchSource)}
                value={source}
              >
                <TabsList className="max-w-full">
                  <TabsTrigger value="discover">{t("Discover")}</TabsTrigger>
                  <TabsTrigger value="library">{t("Library")}</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </form>

          {shouldShowFilters ? (
            <TabsList className="grid w-fit grid-cols-3 self-start">
              {filters().map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}
        </div>

        <div className="min-w-0 px-4">
          <div className="w-full min-w-0 overflow-hidden">
            {shouldShowResultSummary ? (
              <div className="mb-2 px-4 text-xs font-medium text-muted-foreground">
                {source === "discover"
                  ? isDiscoverLoading
                    ? t("Searching Discover")
                    : t("Results in {source}: {count}", { source: t("Discover"), count: activeResultCount })
                  : t("Results in {source}: {count}", { source: t("Library"), count: activeResultCount })}
              </div>
            ) : null}

            {filters().map((filter) => (
              <TabsContent className="mt-0 min-w-0" key={filter.value} value={filter.value}>
                {filter.value === activeFilter ? renderResultsContent(filter.value) : null}
              </TabsContent>
            ))}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
