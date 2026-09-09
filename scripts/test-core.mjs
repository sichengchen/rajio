import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("cargo", ["test", "--locked", "--workspace"]);
run(process.execPath, ["scripts/build-core-wasm.mjs"]);
run(process.execPath, ["--test", "packages/core-wasm/test/feed.test.mjs"]);
run(process.execPath, ["--test", "apps/server/test/core-wasm.test.mjs"]);
if (process.platform === "darwin") {
  run("cargo", ["build", "--locked", "-p", "rajio-core"]);
  run("swift", [
    "test",
    "--package-path",
    "packages/core-swift",
    "--scratch-path",
    "target/swift",
    "-Xlinker",
    "-L",
    "-Xlinker",
    resolve(root, process.env.CARGO_TARGET_DIR ?? "target", "debug"),
  ]);
  run(
    resolve(root, "apps/desktop/node_modules/.bin/electron"),
    ["--test", "packages/core-wasm/test/feed.test.mjs"],
    { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  );
}
