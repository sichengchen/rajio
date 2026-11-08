import { create } from "zustand";

interface SyncBackendStore {
  apiToken: string;
  backendUrl: string;
  enabled: boolean;
  connectionStatus: "connected" | "disconnected" | "error" | "syncing";
  lastValidatedAt?: string;
  setConnection: (data: {
    apiToken: string;
    backendUrl: string;
    enabled: boolean;
    connectionStatus: SyncBackendStore["connectionStatus"];
    lastValidatedAt?: string;
  }) => void;
}

export const useSyncBackendStore = create<SyncBackendStore>((set) => ({
  apiToken: "",
  backendUrl: "",
  enabled: false,
  connectionStatus: "disconnected",
  lastValidatedAt: undefined,
  setConnection: (data) => set(data),
}));
