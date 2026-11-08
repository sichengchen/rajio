import { desktopApi } from "@/desktop-api";
import { useSyncBackendStore } from "@/lib/sync/store";
import { isSyncEnabled } from "../../../shared/sync-settings";
import type { DesktopSettings } from "../../../shared/types";

let pendingWrite = Promise.resolve();

export function initializeSync(settings: DesktopSettings) {
  const connection = useSyncBackendStore.getState();
  const apiToken = settings.syncAuthToken ?? "";
  const backendUrl = settings.syncBaseUrl ?? "";
  const enabled = isSyncEnabled(settings);
  if (connection.apiToken === apiToken && connection.backendUrl === backendUrl && connection.enabled === enabled) return;

  connection.setConnection({
    apiToken,
    backendUrl,
    enabled,
    connectionStatus: enabled && backendUrl && apiToken ? "connected" : "disconnected",
    lastValidatedAt: undefined,
  });
}

export function saveSyncSettings(patch: Pick<DesktopSettings, "syncAuthToken" | "syncBaseUrl" | "syncEnabled">) {
  const write = pendingWrite.then(async () => initializeSync(await desktopApi.settings.set(patch)));
  pendingWrite = write.catch(() => undefined);
  return write;
}

export async function syncNow() {
  useSyncBackendStore.setState({ connectionStatus: "syncing" });
  try {
    await desktopApi.sync.now();
    useSyncBackendStore.setState({
      connectionStatus: "connected",
      lastValidatedAt: new Date().toISOString(),
    });
  } catch (error) {
    useSyncBackendStore.setState({ connectionStatus: "error" });
    throw error;
  }
}
