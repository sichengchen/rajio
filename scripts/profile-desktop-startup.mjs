import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const data = process.env.RAJIO_PROFILE_DATA || mkdtempSync(join(tmpdir(), "rajio-profile-"));
const samples = [];
for (let i = 0; i < 5; i++) {
  const timing = join(data, `startup-${i}.json`);
  const started = Date.now();
  const app = await _electron.launch({
    executablePath: join(
      root,
      "apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    ),
    args: [join(root, "apps/desktop")],
    env: {
      ...process.env,
      RAJIO_USER_DATA_DIR: data,
      RAJIO_TIMING_PATH: timing,
      NEWCASTLE_RENDERER_URL: "",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(
      () => performance.getEntriesByName("rajio:library-ready").length > 0,
    );
    const renderer = await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      marks: performance.getEntriesByType("mark").map((e) => ({ name: e.name, time: e.startTime })),
      paint: performance
        .getEntriesByType("paint")
        .map((e) => ({ name: e.name, time: e.startTime })),
      scripts: performance
        .getEntriesByType("resource")
        .filter((e) => e.initiatorType === "script")
        .map((e) => ({
          name: e.name.split("/").pop(),
          duration: e.duration,
          bytes: e.decodedBodySize,
        })),
    }));
    while (
      !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
    )
      await new Promise((r) => setTimeout(r, 10));
    samples.push({ started, main: JSON.parse(readFileSync(timing, "utf8")), renderer });
  } finally {
    await app.close();
  }
}
console.log(JSON.stringify({ data, samples }, null, 2));
