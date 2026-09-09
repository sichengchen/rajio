const { _electron } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = join(root, "target/desktop-controls");
mkdirSync(artifacts, { recursive: true });
const data = mkdtempSync(join(tmpdir(), "rajio-controls-"));
const bootstrap = join(data, "bootstrap.cjs");
writeFileSync(
  bootstrap,
  `const {Tray}=require('electron');const original=Tray.prototype.on;Tray.prototype.on=function(...args){globalThis.qaTray=this;return original.apply(this,args);};require(${JSON.stringify(root + "/apps/desktop/dist/main/main.cjs")});`,
);
const launch = () =>
  _electron.launch({
    executablePath:
      root + "/apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    args: [bootstrap],
    env: { ...process.env, RAJIO_USER_DATA_DIR: data, NEWCASTLE_RENDERER_URL: "" },
  });
let app = await launch();
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(() => window.newcastle?.controls);
  await page.evaluate(() => window.newcastle.library.subscribe("http://127.0.0.1:8767/feed.xml"));
  await page.reload();
  await page.getByLabel("Open First Offline Episode", { exact: true }).first().click();
  await page
    .getByRole("button", { name: /^Play First Offline Episode/ })
    .first()
    .click();
  await page.waitForFunction(() => {
    const a = document.querySelector("audio");
    return a && !a.paused && a.currentTime > 1;
  });
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () {
      globalThis.qaContextMenu = this;
    };
  });
  const windowEvent = app.waitForEvent("window");
  await page.locator('button[title="Open episode details"]').click({ button: "right" });
  await app.evaluate(() => globalThis.qaContextMenu.items[0].click());
  const mini = await windowEvent;
  await mini.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("audio").paused);
  await mini.getByRole("slider").focus();
  await mini.getByRole("slider").press("Home");
  for (let i = 0; i < 41; i++) await mini.getByRole("slider").press("ArrowRight");
  await page.waitForFunction(() => document.querySelector("audio").currentTime >= 40);
  await mini.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("audio").paused);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await mini.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("audio").paused);
  assert.equal(await mini.locator("audio").count(), 0);
  await mini.screenshot({ path: join(artifacts, "miniplayer.png") });
  const trayEvent = app.waitForEvent("window");
  await app.evaluate(() => globalThis.qaTray.emit("click"));
  const tray = await trayEvent;
  await tray.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("audio").paused);
  await tray.screenshot({ path: join(artifacts, "menubar-player.png") });
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items.find((i) => i.label === "Playback")
      .submenu.items[1].click(),
  );
  await page.waitForFunction(() => document.querySelector("audio").paused);
  await page.evaluate(() => window.newcastle.controls.command({ action: "show" }));
  const bindings = await page.evaluate(
    async () => (await window.newcastle.controls.shortcuts()).bindings,
  );
  bindings.toggle = { accelerator: "CommandOrControl+Alt+P", global: true };
  await page.evaluate((b) => window.newcastle.controls.saveShortcuts(b), bindings);
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Alt+P"),
    ),
    true,
  );
  await assert.rejects(
    page.evaluate(
      (b) => window.newcastle.controls.saveShortcuts({ ...b, back: b.toggle }),
      bindings,
    ),
    /conflict/,
  );
  await app.evaluate(({ globalShortcut }) => {
    globalThis.qaRegister = globalShortcut.register.bind(globalShortcut);
    globalShortcut.register = (key, callback) =>
      key === "CommandOrControl+Alt+O" ? false : globalThis.qaRegister(key, callback);
  });
  await assert.rejects(
    page.evaluate(
      (b) =>
        window.newcastle.controls.saveShortcuts({
          ...b,
          back: { accelerator: "CommandOrControl+Alt+O", global: true },
        }),
      bindings,
    ),
    /unavailable/,
  );
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Alt+P"),
    ),
    true,
  );
  assert.deepEqual(
    (await page.evaluate(() => window.newcastle.controls.shortcuts())).bindings,
    bindings,
  );
  await app.evaluate(({ globalShortcut }) => {
    globalShortcut.register = globalThis.qaRegister;
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Keyboard Shortcuts", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Keyboard Shortcuts", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, "shortcut-settings.png") });
  const scroll = page
    .locator("[data-slot=desktop-safe-scroll-viewport]")
    .filter({ has: page.locator("[data-page-header]") })
    .first();
  await scroll.evaluate((el) => (el.scrollTop = 0));
  await page.waitForFunction(() =>
    document.querySelector("[data-page-header]").classList.contains("border-transparent"),
  );
  await page.screenshot({ path: join(artifacts, "settings-general.png") });
  await scroll.evaluate((el) => (el.scrollTop = 200));
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("[data-page-header]")).borderBottomColor !==
      "rgba(0, 0, 0, 0)",
  );
  assert.deepEqual(errors, []);
  await app.close();
  app = await launch();
  const restored = await app.firstWindow();
  await restored.waitForFunction(() => window.newcastle?.controls);
  assert.equal(
    (await restored.evaluate(() => window.newcastle.controls.shortcuts())).bindings.toggle.global,
    true,
  );
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Alt+P"),
    ),
    true,
  );
  console.log(
    "PASS: shared playback, seek, cover context menu, hidden-main controls, tray/native menu, persisted bindings, duplicate and registration-failure rollback, scroll divider",
  );
} finally {
  await app.close();
}
