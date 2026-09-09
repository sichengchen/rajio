#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CARGO_HOME="$PWD/.tools/cargo"
export RUSTUP_HOME="$PWD/.tools/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
  installer=$(mktemp)
  trap 'rm -f "$installer"' EXIT
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o "$installer"
  sh "$installer" -y --no-modify-path --profile minimal --default-toolchain 1.96.0
fi
rustup toolchain install 1.96.0 --profile minimal
rustup default 1.96.0
rustup target add wasm32-unknown-unknown --toolchain 1.96.0
if [ "$(wasm-bindgen --version 2>/dev/null || true)" != "wasm-bindgen 0.2.100" ]; then
  cargo install wasm-bindgen-cli --version 0.2.100 --locked
fi
node scripts/build-core-wasm.mjs
