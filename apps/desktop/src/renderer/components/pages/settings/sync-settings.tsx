import { useId, useState } from "react";
import { normalizeBackendUrl } from "@rajio-app/contracts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsGroup, SettingsItem, SettingsSwitch } from "@/components/ui-custom/settings";
import { useLocale } from "@/lib/locale";
import { saveSyncSettings, syncNow } from "@/lib/sync/bridge";
import { useSyncBackendStore } from "@/lib/sync/store";
import { getLocale, t } from "../../../../shared/i18n";

function isValidEndpoint(endpoint: string): boolean {
  const url = URL.parse(endpoint);
  return Boolean(
    url &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username && !url.password && !url.search && !url.hash,
  );
}

export function SyncSettings({ ready }: { ready: boolean }) {
  useLocale();
  const endpointId = useId();
  const tokenId = useId();
  const enabled = useSyncBackendStore((state) => state.enabled);
  const savedEndpoint = useSyncBackendStore((state) => state.backendUrl);
  const savedToken = useSyncBackendStore((state) => state.apiToken);
  const status = useSyncBackendStore((state) => state.connectionStatus);
  const lastSyncedAt = useSyncBackendStore((state) => state.lastValidatedAt);
  const [endpointDraft, setEndpointDraft] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  const endpointInput = endpointDraft ?? savedEndpoint;
  const tokenInput = tokenDraft ?? savedToken;
  const endpoint = normalizeBackendUrl(endpointInput);
  const token = tokenInput.trim();
  const endpointInvalid = Boolean(endpoint && !isValidEndpoint(endpoint));
  const syncing = status === "syncing";
  const canSync = !syncing && pendingWrites === 0 && endpoint && token && !endpointInvalid &&
    endpoint === savedEndpoint && token === savedToken;
  const lastSynced = lastSyncedAt
    ? t("Last synced: {date}", { date: new Date(lastSyncedAt).toLocaleString(getLocale()) })
    : null;

  async function save(patch: Parameters<typeof saveSyncSettings>[0]) {
    setPendingWrites((count) => count + 1);
    try {
      await saveSyncSettings(patch);
      if (patch.syncEnabled === "false") {
        setEndpointDraft(null);
        setTokenDraft(null);
      }
    } catch {
      toast.error(t("Unable to save sync settings"));
    } finally {
      setPendingWrites((count) => count - 1);
    }
  }

  function changeEndpoint(value: string) {
    setEndpointDraft(value);
    const normalized = normalizeBackendUrl(value);
    if (!normalized || isValidEndpoint(normalized)) void save({ syncBaseUrl: normalized });
  }

  return (
    <SettingsGroup title={t("Sync Backend")}>
      <SettingsSwitch
        label={t("Enable Sync")}
        checked={enabled}
        disabled={!ready || syncing || pendingWrites > 0}
        onCheckedChange={(checked) => void save({ syncEnabled: checked ? "true" : "false" })}
      />
      {ready && enabled ? (
        <>
          <SettingsItem
            label={t("Endpoint")}
            controlId={endpointId}
            description={endpointInvalid ? t("Enter a valid HTTP or HTTPS endpoint") : undefined}
          >
            <Input
              id={endpointId}
              type="url"
              placeholder="https://sync.example.com"
              autoCapitalize="off"
              spellCheck={false}
              value={endpointInput}
              onChange={(event) => changeEndpoint(event.target.value)}
              className="w-full sm:w-72"
              disabled={syncing}
              aria-invalid={endpointInvalid}
              aria-describedby={endpointInvalid ? `${endpointId}-description` : undefined}
            />
          </SettingsItem>
          <SettingsItem label={t("Token")} controlId={tokenId}>
            <Input
              id={tokenId}
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(event) => {
                setTokenDraft(event.target.value);
                void save({ syncAuthToken: event.target.value.trim() });
              }}
              className="w-full sm:w-72"
              disabled={syncing}
            />
          </SettingsItem>
          <div className="flex flex-wrap items-center justify-end gap-2 py-2">
            <p role="status" className="mr-auto text-sm text-muted-foreground">
              {status === "error" ? t("Sync failed") : lastSynced}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!canSync}
              onClick={() => void syncNow().catch(() => toast.error(t("Sync failed")))}
            >
              {t(syncing ? "Syncing…" : "Sync Now")}
            </Button>
          </div>
        </>
      ) : null}
    </SettingsGroup>
  );
}
