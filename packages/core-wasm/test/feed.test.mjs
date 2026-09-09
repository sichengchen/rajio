import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { initializeCore, parseFeed } from "../src/index.js";

initializeCore(readFileSync(new URL("../generated/rajio_core_bg.wasm", import.meta.url)));
const fixtures = new URL("../../../crates/rajio-core/tests/fixtures/", import.meta.url);
for (const name of readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
  test(`Wasm preserves desktop behavior: ${name}`, () => {
    const fixture = JSON.parse(readFileSync(new URL(name, fixtures), "utf8"));
    assert.deepEqual(parseFeed(fixture.request), fixture.expected);
  });
}
test("Wasm propagates parse errors", () => {
  assert.throws(
    () =>
      parseFeed({
        feedUrl: "https://example.com/feed",
        xml: "",
        fetchedAt: "2026-09-05T00:00:00Z",
      }),
    /RSS feed is empty/,
  );
});
