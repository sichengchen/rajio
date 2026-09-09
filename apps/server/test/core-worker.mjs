import { Hono } from "hono";
import { initializeCore, parseFeed } from "../../../packages/core-wasm/src/index.js";
import module from "../../../packages/core-wasm/generated/rajio_core_bg.wasm";

// This harness exercises the production runtime without adding a public API route.
initializeCore(module);
const app = new Hono();
app.post("/parse", async (c) => {
  try {
    return c.json({ value: parseFeed(await c.req.json()) });
  } catch (error) {
    return c.json({ error: error.message }, 400);
  }
});
export default app;
