import assert from "node:assert/strict";
import test from "node:test";
import { RefreshScheduler } from "./refresh";
import type { LibraryService } from "./library";

test("refresh deduplicates lifecycle triggers and bounds requests while collecting failures", async () => {
  let active = 0,
    peak = 0,
    calls = 0;
  const library = {
    listPodcasts: async () =>
      Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: `Show ${i}` })),
    refresh: async (id: string) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (id === "2") throw new Error("HTTP 503");
    },
  } as unknown as LibraryService;
  const scheduler = new RefreshScheduler(library, () => {});
  const first = scheduler.run();
  assert.equal(scheduler.run(), first);
  await first;
  assert.equal(calls, 9);
  assert.equal(peak, 3);
  assert.equal(scheduler.state.running, false);
  assert.deepEqual(scheduler.state.failures, ["Show 2: HTTP 503"]);
});
