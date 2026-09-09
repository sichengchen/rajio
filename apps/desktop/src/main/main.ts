import { ipcChannels } from "../shared/ipc";
import {
  app,
  BrowserWindow,
  dialog,
  nativeImage,
  powerMonitor,
  Tray,
  Menu,
  protocol,
  shell,
  ipcMain,
} from "electron";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalDatabase } from "./db";
import { registerExternalNavigation } from "./external-navigation";
import { imageCacheScheme, registerImageCacheProtocol } from "./image-protocol";
import { registerIpcHandlers } from "./ipc";
import { resolveDefaultDownloadDirectory } from "./settings";

const mainDir =
  typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const appId = "com.scchan.rajio";
const legacyUserDataPath = path.join(app.getPath("appData"), "Newcastle");
const rendererDevServerUrl = process.env.NEWCASTLE_RENDERER_URL;
const appIconFilename = process.platform === "darwin" ? "icon-macos.png" : "icon.png";
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, appIconFilename)
  : path.resolve(mainDir, "../../resources", appIconFilename);
const appIcon = nativeImage.createFromPath(appIconPath);
const startupEpisodeArtworkLimit = 24;
const startupArtworkWaitMs = 3_000;
let tray: Tray | undefined;
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting || startupSmokePath) return;
  quitting = true;
  event.preventDefault();
  const window = BrowserWindow.getAllWindows()[0];
  if (!window || window.webContents.isDestroyed()) {
    app.quit();
    return;
  }
  const token = crypto.randomUUID();
  const finish = () => {
    clearTimeout(timeout);
    ipcMain.removeListener(ipcChannels.playback.checkpointReady, ready);
    app.quit();
  };
  const ready = (event: Electron.IpcMainEvent, received: string) => {
    if (event.sender.id === window.webContents.id && received === token) finish();
  };
  const timeout = setTimeout(finish, 2000);
  ipcMain.on(ipcChannels.playback.checkpointReady, ready);
  window.webContents.send(ipcChannels.playback.checkpointRequested, token);
});
const startupSmokePath = process.env.RAJIO_STARTUP_SMOKE_PATH;

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
    scheme: imageCacheScheme,
  },
]);

function createMainWindow(artworkReady: Promise<unknown> = Promise.resolve()): BrowserWindow {
  const window = new BrowserWindow({
    height: 860,
    icon: appIcon,
    minHeight: 640,
    minWidth: 960,
    show: false,
    title: "Rajio",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {}),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(mainDir, "../preload/index.cjs"),
      sandbox: false,
    },
    width: 1280,
  });

  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  registerExternalNavigation(window.webContents, (url) => shell.openExternal(url));

  window.once("ready-to-show", () => {
    void artworkReady.finally(() => {
      if (!startupSmokePath && !window.isDestroyed()) {
        window.show();
      }
    });
  });

  if (startupSmokePath) {
    window.webContents.once("did-finish-load", () => {
      writeFileSync(startupSmokePath, "ready\n");
      app.quit();
    });
  }

  if (rendererDevServerUrl) {
    void window.loadURL(rendererDevServerUrl);
  } else {
    void window.loadFile(path.join(mainDir, "../renderer/index.html"));
  }

  return window;
}

app.setName("Rajio");
if (existsSync(legacyUserDataPath)) {
  app.setPath("userData", legacyUserDataPath);
}
if (process.env.RAJIO_USER_DATA_DIR) app.setPath("userData", process.env.RAJIO_USER_DATA_DIR);
app.setAppUserModelId(appId);
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    window.show();
    window.focus();
  }
});

void app
  .whenReady()
  .then(() => {
    if (process.platform === "darwin" && !app.isPackaged && app.dock && !appIcon.isEmpty()) {
      app.dock.setIcon(appIcon);
    }

    const db = createLocalDatabase(app.getPath("userData"));
    const imageCache = registerImageCacheProtocol(
      path.join(app.getPath("userData"), "image-cache-v1"),
    );
    const podcastArtworkUrls = db.listPodcastArtworkUrls();
    const episodeArtworkUrls = db.listEpisodeArtworkUrls();
    const startupArtworkUrls = uniqueArtworkUrls([
      ...podcastArtworkUrls,
      ...episodeArtworkUrls.slice(0, startupEpisodeArtworkLimit),
    ]);
    const allArtworkUrls = uniqueArtworkUrls([...podcastArtworkUrls, ...episodeArtworkUrls]);
    const initialArtworkWarmup = imageCache.warm(startupArtworkUrls);
    const startupArtworkReady = waitUpTo(initialArtworkWarmup, startupArtworkWaitMs);

    void initialArtworkWarmup.then(() => imageCache.warm(allArtworkUrls));
    const defaultDownloadDirectory = process.env.RAJIO_USER_DATA_DIR
      ? path.join(app.getPath("userData"), "Downloads")
      : resolveDefaultDownloadDirectory(
          process.platform,
          app.getName(),
          app.getPath("appData"),
          app.getPath("downloads"),
        );
    const refresh = registerIpcHandlers(db, defaultDownloadDirectory);
    const mainWindow = createMainWindow(startupArtworkReady);
    if (process.platform !== "darwin") {
      tray = new Tray(appIcon);
      tray.setToolTip("Rajio");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: "Open Rajio",
            click: () => {
              mainWindow.show();
              mainWindow.focus();
            },
          },
          { role: "quit", label: "Quit Rajio" },
        ]),
      );
      tray.on("click", () => {
        mainWindow.show();
        mainWindow.focus();
      });
    }
    const refreshLibrary = () => {
      void refresh.run().catch((error) => console.error("Refresh failed", error));
    };
    const refreshTimer = setInterval(refreshLibrary, 15 * 60_000);
    refreshTimer.unref();
    powerMonitor.on("resume", refreshLibrary);
    if (!startupSmokePath) refreshLibrary();
    app.on("will-quit", () => {
      clearInterval(refreshTimer);
      db.close();
    });

    app.on("activate", () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.show();
        window.focus();
      } else {
        createMainWindow();
      }
      refreshLibrary();
    });
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to start Rajio:", error);
    dialog.showErrorBox("Rajio failed to start", message);
    app.quit();
  });

function uniqueArtworkUrls(urls: Array<string | undefined>): string[] {
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function waitUpTo(task: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    const settle = () => {
      clearTimeout(timeout);
      resolve();
    };

    void task.then(settle, settle);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
