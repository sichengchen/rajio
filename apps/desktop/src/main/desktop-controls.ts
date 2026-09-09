import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
  type MenuItemConstructorOptions,
} from "electron";
import {
  controlChannel as c,
  defaultShortcuts,
  emptyControlState,
  shortcutActions,
  shortcutLabels,
  validateShortcuts,
  type ControlCommand,
  type ControlState,
  type ShortcutBindings,
} from "../shared/controls";
import { t, subscribeLocale } from "../shared/i18n";
import type { LocalDatabase } from "./db";

export function installDesktopControls(
  owner: BrowserWindow,
  db: LocalDatabase,
  createSurface: (kind: "mini" | "tray") => BrowserWindow,
  iconPath: string,
) {
  let state: ControlState = emptyControlState;
  let bindings = defaultShortcuts;
  let shortcutError: string | undefined;
  const surfaces = new Map<string, BrowserWindow>();
  const trusted = (id: number) =>
    id === owner.webContents.id ||
    [...surfaces.values()].some((w) => !w.isDestroyed() && w.webContents.id === id);
  const broadcast = (channel: string, value: unknown) => {
    for (const w of [owner, ...surfaces.values()])
      if (!w.isDestroyed()) w.webContents.send(channel, value);
  };
  const showMain = () => {
    owner.show();
    owner.focus();
  };
  const surface = (kind: "mini" | "tray") => {
    let w = surfaces.get(kind);
    if (!w || w.isDestroyed()) {
      w = createSurface(kind);
      surfaces.set(kind, w);
    }
    return w;
  };
  const command = (cmd: ControlCommand) => {
    if (cmd.action === "mini") {
      const w = surface("mini");
      w.show();
      w.focus();
      return;
    }
    if (cmd.action === "show" || cmd.action === "settings") showMain();
    if (
      cmd.action === "seek" &&
      (!Number.isFinite(cmd.value) || cmd.value! < 0 || cmd.value! > state.duration)
    )
      return;
    if (!["toggle", "back", "forward", "next", "settings", "seek"].includes(cmd.action)) return;
    owner.webContents.send(c + ":command", cmd);
  };
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip("Rajio");
  let trayMenu: Menu;
  const rebuildMenus = () => {
    const playback: MenuItemConstructorOptions[] = [
      { label: state.title || t("No episode selected"), enabled: false },
      ...(["toggle", "back", "forward", "next"] as const).map((action) => ({
        label: t(action === "toggle" ? (state.playing ? "Pause" : "Play") : shortcutLabels[action]),
        enabled: !!state.episodeId,
        click: () => command({ action }),
      })),
      { type: "separator" as const },
      { label: t("Open Rajio"), click: showMain },
      { label: t("Settings"), click: () => command({ action: "settings" }) },
      { role: "quit", label: t("Quit Rajio") },
    ];
    trayMenu = Menu.buildFromTemplate(playback);
    if (process.platform !== "darwin") tray.setContextMenu(trayMenu);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === "darwin"
          ? [
              {
                label: "Rajio",
                submenu: [
                  { role: "about" as const },
                  { type: "separator" as const },
                  {
                    label: t("Settings"),
                    accelerator: "CommandOrControl+,",
                    click: () => command({ action: "settings" }),
                  },
                  { type: "separator" as const },
                  { role: "hide" as const },
                  { role: "hideOthers" as const },
                  { role: "unhide" as const },
                  { type: "separator" as const },
                  { role: "quit" as const },
                ],
              },
            ]
          : []),
        { role: "editMenu" },
        { label: t("Playback"), submenu: playback.slice(0, 5) },
        {
          label: t("Window"),
          submenu: [
            { label: t("Open Rajio"), click: showMain },
            { role: "minimize" },
            { role: "close" },
          ],
        },
      ]),
    );
  };
  tray.on("click", () => {
    const w = surface("tray");
    if (w.isVisible()) {
      w.hide();
      return;
    }
    const bounds = tray.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const [width, height] = w.getSize();
    w.setPosition(
      Math.round(
        Math.max(
          area.x,
          Math.min(bounds.x + bounds.width / 2 - width / 2, area.x + area.width - width),
        ),
      ),
      Math.round(
        Math.max(area.y, Math.min(bounds.y + bounds.height + 4, area.y + area.height - height)),
      ),
    );
    w.show();
  });
  tray.on("right-click", () => tray.popUpContextMenu(trayMenu));
  ipcMain.on(c + ":cover-menu", (event) => {
    if (event.sender.id !== owner.webContents.id) return;
    Menu.buildFromTemplate([
      { label: t("Mini Player"), click: () => command({ action: "mini" }) },
    ]).popup({ window: owner });
  });
  ipcMain.handle(c + ":get", (event) => {
    if (!trusted(event.sender.id)) throw new Error("Unknown control surface");
    return state;
  });
  ipcMain.on(c + ":state", (event, next: ControlState) => {
    if (
      event.sender.id !== owner.webContents.id ||
      !next ||
      typeof next.title !== "string" ||
      !Number.isFinite(next.position) ||
      !Number.isFinite(next.duration)
    )
      return;
    const changed =
      next.title !== state.title ||
      next.playing !== state.playing ||
      next.episodeId !== state.episodeId;
    state = next;
    broadcast(c + ":state", state);
    if (changed) {
      tray.setToolTip(next.title ? `Rajio — ${next.title}` : "Rajio");
      rebuildMenus();
    }
  });
  ipcMain.on(c + ":command", (event, cmd: ControlCommand) => {
    if (trusted(event.sender.id) && cmd && typeof cmd.action === "string") command(cmd);
  });
  const register = (next: ShortcutBindings) => {
    globalShortcut.unregisterAll();
    for (const action of shortcutActions) {
      const binding = next[action];
      if (
        binding.global &&
        binding.accelerator &&
        !globalShortcut.register(binding.accelerator, () => command({ action }))
      )
        throw new Error(t("Shortcut unavailable") + ": " + binding.accelerator);
    }
  };
  try {
    bindings = validateShortcuts(
      JSON.parse(db.getSettings().keyboardShortcuts ?? JSON.stringify(defaultShortcuts)),
    );
    register(bindings);
  } catch (error) {
    globalShortcut.unregisterAll();
    shortcutError = String(error);
  }
  ipcMain.handle(c + ":shortcuts", (event) => {
    if (!trusted(event.sender.id)) throw new Error("Unknown control surface");
    return { bindings, error: shortcutError };
  });
  ipcMain.handle(c + ":save-shortcuts", (event, value: unknown) => {
    if (event.sender.id !== owner.webContents.id)
      throw new Error("Settings are owned by the main window");
    let next: ShortcutBindings;
    try {
      next = validateShortcuts(value);
    } catch (error) {
      throw new Error(t((error as Error).message));
    }
    try {
      register(next);
      db.setSettings({ keyboardShortcuts: JSON.stringify(next) });
    } catch (error) {
      try {
        register(bindings);
      } catch (restoreError) {
        shortcutError = String(restoreError);
      }
      throw error;
    }
    bindings = next;
    shortcutError = undefined;
    broadcast(c + ":shortcuts", bindings);
  });
  rebuildMenus();
  const unsubscribe = subscribeLocale(rebuildMenus);
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    tray.destroy();
    unsubscribe();
  });
}
