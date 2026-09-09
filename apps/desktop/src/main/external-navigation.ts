import type { WebContents } from "electron";

const externalProtocols = new Set(["https:", "http:", "mailto:", "tel:"]);

export function registerExternalNavigation(
  webContents: WebContents,
  openExternal: (url: string) => Promise<void>,
): void {
  const openLink = (url: string) => {
    try {
      if (externalProtocols.has(new URL(url).protocol)) {
        void openExternal(url).catch((error: unknown) => {
          console.error("Failed to open external link:", error);
        });
      }
    } catch {
      // Ignore malformed URLs.
    }
  };

  webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    // The renderer uses hash routing in both development and packaged builds.
    if (url.split("#")[0] === webContents.getURL().split("#")[0]) {
      return;
    }

    event.preventDefault();
    openLink(url);
  });
}
