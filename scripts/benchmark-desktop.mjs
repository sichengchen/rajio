// PLAYWRIGHT_MODULE can point to a local Playwright install; no production dependency.
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const count = Number(process.env.BENCH_EPISODES || 5000);
const data = mkdtempSync(join(tmpdir(), "rajio-benchmark-"));
const png = readFileSync(resolve(root, "apps/desktop/resources/icon-macos.png"));
const server = createServer((req, res) => {
  if (req.url === "/art.png") {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(png);
    }, 2000);
    return;
  }
  res.writeHead(200, { "Content-Type": "application/rss+xml" });
  const base = `http://127.0.0.1:${server.address().port}`;
  res.end(
    `<rss><channel><title>Performance Library</title><image><url>${base}/art.png</url></image>${Array.from({ length: count }, (_, i) => `<item><title>Benchmark Episode ${i}</title><guid>${i}</guid><pubDate>Tue, 08 Sep 2026 12:00:00 GMT</pubDate><description>${"Episode description. ".repeat(20)}</description><enclosure url="${base}/audio/${i}.mp3" type="audio/mpeg"/></item>`).join("")}</channel></rss>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const launch = () =>
  _electron.launch({
    executablePath: resolve(
      root,
      "apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    ),
    args: [resolve(root, "apps/desktop")],
    env: { ...process.env, RAJIO_USER_DATA_DIR: data, NEWCASTLE_RENDERER_URL: "" },
  });
const results = {
  episodes: count,
  platform: process.platform,
  arch: process.arch,
  cold: [],
  warm: [],
  navigation: [],
  reopen: [],
};
let app;
try {
  app = await launch();
  let page = await app.firstWindow();
  await page.waitForFunction(() => !!window.newcastle);
  await page.evaluate(
    (url) => window.newcastle.library.subscribe(url),
    `http://127.0.0.1:${server.address().port}/feed.xml`,
  );
  await app.close();
  app = null;
  for (const mode of ["cold", "warm"])
    for (let i = 0; i < 3; i++) {
      if (mode === "cold") rmSync(join(data, "image-cache-v1"), { recursive: true, force: true });
      const start = performance.now();
      app = await launch();
      page = await app.firstWindow();
      await page.getByRole("heading", { name: "What's New", exact: true }).waitFor();
      while (
        !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
      )
        await new Promise((r) => setTimeout(r, 20));
      results[mode].push(Math.round(performance.now() - start));
      if (i === 0) {
        for (const [label, hash] of [
          ["Settings", "/settings"],
          ["Downloaded", "/downloaded"],
          ["Favorites", "/favorites"],
          ["Search", "/search"],
          ["What's New", "/whats-new"],
        ]) {
          const t = performance.now();
          await page.evaluate((hash) => (location.hash = hash), hash);
          if (label === "Search") await page.getByPlaceholder(/Search in/).waitFor();
          else await page.getByRole("heading", { name: label, exact: true }).first().waitFor();
          results.navigation.push({ mode, page: label, ms: Math.round(performance.now() - t) });
        }
      }
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      const reopen = performance.now();
      await app.evaluate(({ app }) => app.emit("activate"));
      results.reopen.push(Math.round(performance.now() - reopen));
      // Let the controlled 2-second artwork request finish before the warm-cache samples.
      await new Promise((r) => setTimeout(r, 2100));
      await app.close();
      app = null;
    }
  results.data = data;
  results.measuredAt = new Date().toISOString();
  console.log(JSON.stringify(results, null, 2));
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 2) + "\n");
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  server.close();
}
