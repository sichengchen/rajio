import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export function rustEnvironment(env = process.env) {
  const local = resolve(root, ".tools");
  if (existsSync(resolve(local, "cargo/bin/rustup"))) {
    return {
      ...env,
      CARGO_HOME: resolve(local, "cargo"),
      RUSTUP_HOME: resolve(local, "rustup"),
      PATH: resolve(local, "cargo/bin") + delimiter + env.PATH,
    };
  }
  return {
    ...env,
    PATH:
      (env.PATH ?? "") + delimiter + resolve(env.CARGO_HOME ?? resolve(homedir(), ".cargo"), "bin"),
  };
}
