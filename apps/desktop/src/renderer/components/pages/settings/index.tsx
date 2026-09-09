import { ShortcutSettings } from "../../common/shortcut-settings";
import { languages, getLanguageChoice, setLanguage } from "../../../../shared/i18n";
import { t, getLocale } from "../../../../shared/i18n";
import { useLocale } from "@/lib/locale";
"use client";

import { useState, useEffect } from "react";
import { AlertCircle, FolderOpen, Trash2 } from "lucide-react";
import {
  SettingsGroup,
  SettingsItem,
  SettingsSwitch,
  SettingsSelect,
  SettingsAction,
  SettingsDivider,
  SettingsAlert,
} from "@/components/ui-custom/settings";
import { usePodcastStore } from "@/lib/store";
import { APP_VERSION } from "@/lib/constants";
import { useTheme } from "next-themes";
import { OPMLManager } from "../../common/opml-manager";
import { toast } from "sonner";
import { desktopApi } from "@/desktop-api";

export function SettingsPage() {
  useLocale();
  const [language, setLanguageChoice] = useState(getLanguageChoice);
  const [refreshState, setRefreshState] = useState<{
    running: boolean;
    checkedAt?: string;
    failures: string[];
  }>({ running: false, failures: [] });
  useEffect(() => {
    const load = () => {
      void desktopApi.library.refreshState?.().then(setRefreshState);
    };
    load();
    return desktopApi.library.onChanged?.(load);
  }, []);
  const refreshFeeds = async () => {
    setRefreshState((state) => ({ ...state, running: true }));
    try {
      await usePodcastStore.getState().refreshAllPodcasts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Refresh failed"));
    } finally {
      const state = await desktopApi.library.refreshState?.();
      if (state) setRefreshState(state);
      else setRefreshState((state) => ({ ...state, running: false }));
    }
  };
  const [isClearingData, setIsClearingData] = useState(false);
  const [isClearingDownloads, setIsClearingDownloads] = useState(false);
  const [isChoosingDownloadDirectory, setIsChoosingDownloadDirectory] = useState(false);
  const [downloadLimit, setDownloadLimit] = useState("2147483648");
  const [downloadDirectory, setDownloadDirectory] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  const {
    preferences,
    setSkipInterval,
    setAutoPlay,
    setItunesSearchEnabled,
    clearAllData,
    podcasts,
    storageStats,
    refreshStorageStats,
    clearAllDownloads,
  } = usePodcastStore();

  // Load storage stats on mount
  useEffect(() => {
    refreshStorageStats();
  }, [refreshStorageStats]);

  useEffect(() => {
    let isCurrent = true;

    void desktopApi.settings
      .get()
      .then((settings) => {
        if (isCurrent) {
          setDownloadDirectory(settings.downloadDirectory ?? null);
          setDownloadLimit(settings.downloadLimitBytes ?? "2147483648");
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load download directory:", error);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleSkipIntervalChange = (value: string) => {
    setSkipInterval(parseInt(value));
  };

  const handleAutoPlayChange = (checked: boolean) => {
    setAutoPlay(checked);
  };

  const handleItunesSearchEnabledChange = (checked: boolean) => {
    setItunesSearchEnabled(checked);
  };

  const handleThemeChange = (value: string) => {
    setTheme(value);
  };

  const handleChooseDownloadDirectory = async () => {
    setIsChoosingDownloadDirectory(true);
    try {
      const selectedDirectory = await desktopApi.settings.chooseDownloadDirectory();
      if (selectedDirectory) {
        setDownloadDirectory(selectedDirectory);
        toast.success(t("Download folder updated"));
      }
    } catch (error) {
      toast.error(t("Failed to update the download folder"));
      console.error("Choose download directory error:", error);
    } finally {
      setIsChoosingDownloadDirectory(false);
    }
  };

  const handleClearAllDownloads = async () => {
    setIsClearingDownloads(true);
    try {
      await clearAllDownloads();
      await refreshStorageStats();
      toast.success(t("All downloads have been cleared successfully!"));
    } catch (error) {
      toast.error(t("Failed to clear downloads. Please try again."));
      console.error("Clear downloads error:", error);
    } finally {
      setIsClearingDownloads(false);
    }
  };

  const handleClearAllData = async () => {
    setIsClearingData(true);
    try {
      await clearAllData();
      toast.success(t("All data has been cleared successfully!"));
    } catch (error) {
      toast.error(t("Failed to clear data. Please try again."));
      console.error("Clear data error:", error);
    } finally {
      setIsClearingData(false);
    }
  };

  return (
    <>
      <div className="flex w-full flex-col gap-8 px-2 py-6">
        {/* Theme Settings */}
        <SettingsGroup title={t("Appearance")}>
          <SettingsSelect
            label={t("Language")}
            value={language}
            options={languages.map(item => ({ ...item, label: item.value === "system" ? t("Follow System") : item.label }))}
            onValueChange={(value) => {
              void desktopApi.settings.set({ language: value }).then(() => {
                setLanguage(value, navigator.language);
                setLanguageChoice(getLanguageChoice());
                document.documentElement.lang = value === "system" ? navigator.language : value;
              }).catch(() => toast.error(t("Unable to change language")));
            }}
          />
          <SettingsSelect
            label={t("Theme")}
            
            value={theme || "system"}
            onValueChange={handleThemeChange}
            options={[
              { value: "system", label: t("Follow System") },
              { value: "light", label: t("Light") },
              { value: "dark", label: t("Dark") },
            ]}
            placeholder={t("Select theme")}
          />
        </SettingsGroup>

        <SettingsGroup title={t("Subscriptions")}>
          <SettingsAction
            label={t("Refresh podcasts")}
            description={
              refreshState.checkedAt
                ? t("Last checked: {date}", { date: new Date(refreshState.checkedAt).toLocaleString(getLocale()) })
                : t("Podcasts refresh automatically when Rajio opens and resumes.")
            }
            actionLabel={refreshState.running ? "Refreshing…" : t("Refresh now")}
            onAction={refreshFeeds}
            disabled={refreshState.running}
          />
          {refreshState.failures.map((failure) => (
            <p key={failure} className="text-sm text-destructive">
              {failure}
            </p>
          ))}
        </SettingsGroup>
        {/* Playback Settings */}
        <SettingsGroup title={t("Playback")}>
          <SettingsSelect
            label={t("Skip Interval")}
            
            value={(preferences.skipInterval || 30).toString()}
            onValueChange={handleSkipIntervalChange}
            options={[
              { value: "5", label: new Intl.NumberFormat(getLocale(), { style: "unit", unit: "second", unitDisplay: "long" }).format(5) },
              { value: "10", label: new Intl.NumberFormat(getLocale(), { style: "unit", unit: "second", unitDisplay: "long" }).format(10) },
              { value: "15", label: new Intl.NumberFormat(getLocale(), { style: "unit", unit: "second", unitDisplay: "long" }).format(15) },
              { value: "30", label: new Intl.NumberFormat(getLocale(), { style: "unit", unit: "second", unitDisplay: "long" }).format(30) },
              { value: "60", label: new Intl.NumberFormat(getLocale(), { style: "unit", unit: "second", unitDisplay: "long" }).format(60) },
            ]}
            placeholder={t("Select interval")}
          />

          <SettingsSwitch
            label={t("Auto Play")}
            description={t("Automatically play next episode")}
            checked={preferences.autoPlay || false}
            onCheckedChange={handleAutoPlayChange}
          />
        </SettingsGroup>

        {/* Search Settings */}
        <SettingsGroup title={t("Search")}>
          <SettingsSwitch
            label={t("Search from iTunes")}
            description={t("Enable podcast discovery from iTunes in the Search tab")}
            checked={preferences.itunesSearchEnabled ?? true}
            onCheckedChange={handleItunesSearchEnabledChange}
          />
        </SettingsGroup>

        <ShortcutSettings />

        {/* Storage Management */}
        <SettingsGroup title={t("Storage Management")}>
          <SettingsSelect
            label={t("Download storage limit")}
            description={t("Maximum space used by downloaded audio")}
            value={downloadLimit}
            options={[
              { value: "536870912", label: t("512 MB") },
              { value: "2147483648", label: t("2 GB") },
              { value: "10737418240", label: t("10 GB") },
              { value: "53687091200", label: t("50 GB") },
            ]}
            onValueChange={(value) => {
              void desktopApi.settings
                .set({ downloadLimitBytes: value })
                .then(() => setDownloadLimit(value))
                .catch(() => toast.error(t("Unable to update download limit")));
            }}
          />
          <SettingsAction
            label={t("Download Folder")}
            description={downloadDirectory ?? t("Choose where new downloads are saved")}
            actionLabel={downloadDirectory ? t("Change Folder") : t("Choose Folder")}
            loadingLabel={t("Choosing Folder…")}
            onAction={handleChooseDownloadDirectory}
            variant="outline"
            icon={FolderOpen}
            loading={isChoosingDownloadDirectory}
          />

          {storageStats && storageStats.totalSize > 500 * 1024 * 1024 && (
            <SettingsAlert variant="warning" icon={AlertCircle}>
              <p className="text-muted-foreground">
                {t("Storage use exceeds 500 MB. Remove downloads to free up space.")}
              </p>
            </SettingsAlert>
          )}

          <SettingsDivider>
            <SettingsAction
              label={t("Clear All Downloads")}
              description={t("Delete all downloaded episodes to free up storage space")}
              actionLabel={t("Clear Downloads")}
              loadingLabel={t("Clearing...")}
              onAction={handleClearAllDownloads}
              variant="destructive"
              icon={Trash2}
              disabled={
                !storageStats?.downloadedEpisodes ||
                storageStats.downloadedEpisodes === 0 ||
                isClearingDownloads
              }
              loading={isClearingDownloads}
              confirmDialog={{
                title: t("Clear All Downloads"),
                description: t("Delete all downloads and free {size}? Subscriptions and playback progress will be kept.", { size: formatFileSize(storageStats?.totalSize || 0) }),
                actionLabel: t("Clear Downloads"),
              }}
            />
          </SettingsDivider>
        </SettingsGroup>

        {/* Data Management */}
        <SettingsGroup title={t("Data Management")}>
          <SettingsItem
            label={t("OPML Management")}
            description={t("Import or export your podcast subscriptions")}
          >
            <OPMLManager />
          </SettingsItem>

          <SettingsDivider>
            <SettingsAction
              label={t("Reset Application")}
              description={t("Permanently delete all podcasts, episodes, and playback progress")}
              actionLabel={t("Clear All Data")}
              loadingLabel={t("Clearing...")}
              onAction={handleClearAllData}
              variant="destructive"
              icon={Trash2}
              disabled={podcasts.length === 0 || isClearingData}
              loading={isClearingData}
              confirmDialog={{
                title: t("Clear All Data"),
                description: t("Permanently delete {count} subscriptions, downloads, playback history, and preferences? This cannot be undone.", { count: podcasts.length }),
                actionLabel: t("Clear All Data"),
              }}
            />
          </SettingsDivider>
        </SettingsGroup>

        <div className="text-xs text-muted-foreground text-center">{t("Version {version}", { version: APP_VERSION })} · Created by{" "}
          <a
            href="https://www.scchan.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            scchan
          </a>{" "}
          · View on{" "}
          <a
            href="https://github.com/sichengchen/rajio"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </>
  );
}
