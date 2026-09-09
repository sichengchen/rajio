import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unstable_dev } from "wrangler";

await test("Hono executes Rust/Wasm in the Workers runtime", async () => {
  const worker = await unstable_dev(fileURLToPath(new URL("./core-worker.mjs", import.meta.url)), {
    config: fileURLToPath(new URL("./wrangler.core.jsonc", import.meta.url)),
    local: true,
    port: 0,
    inspectorPort: 0,
    persist: false,
    logLevel: "error",
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
  try {
    const fixtures = new URL("../../../crates/rajio-core/tests/fixtures/", import.meta.url);
    for (const name of readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
      const fixture = JSON.parse(readFileSync(new URL(name, fixtures), "utf8"));
      const response = await worker.fetch("/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fixture.request),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { value: fixture.expected }, name);
    }
    const response = await worker.fetch("/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedUrl: "https://example.com/feed",
        xml: "",
        fetchedAt: "2026-09-05T00:00:00Z",
      }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "RSS feed is empty" });
  } finally {
    await worker.stop();
  }
});
