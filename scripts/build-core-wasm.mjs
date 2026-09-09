import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { rustEnvironment } from "./rust-environment.mjs";
const env = rustEnvironment();
const root = fileURLToPath(new URL("../", import.meta.url));
const expectedVersion = "0.2.100";
const version = spawnSync("wasm-bindgen", ["--version"], { encoding: "utf8", env });
if (version.status !== 0 || version.stdout.trim() !== `wasm-bindgen ${expectedVersion}`) {
  throw new Error(
    `Desktop Rust tools are missing or incompatible. Run pnpm setup:desktop (requires curl and a C compiler), then retry. Expected wasm-bindgen ${expectedVersion}.`,
  );
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("cargo", [
  "build",
  "--locked",
  "--release",
  "--target",
  "wasm32-unknown-unknown",
  "-p",
  "rajio-core",
]);
const target = resolve(root, process.env.CARGO_TARGET_DIR ?? "target");
run("wasm-bindgen", [
  resolve(target, "wasm32-unknown-unknown/release/rajio_core.wasm"),
  "--target",
  "web",
  "--out-dir",
  resolve(root, "packages/core-wasm/generated"),
  "--out-name",
  "rajio_core",
]);

// An embedded Node entry keeps Electron's packaged CJS independent of asset paths.
writeFileSync(
  resolve(root, "packages/core-wasm/generated/bytes.js"),
  `export default ${JSON.stringify(readFileSync(resolve(root, "packages/core-wasm/generated/rajio_core_bg.wasm")).toString("base64"))};\n`,
);
