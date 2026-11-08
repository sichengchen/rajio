import type { DesktopSettings } from "./types";

export function isSyncEnabled(settings: DesktopSettings): boolean {
  return settings.syncEnabled === undefined
    ? Boolean(settings.syncBaseUrl && settings.syncAuthToken)
    : settings.syncEnabled === "true";
}
