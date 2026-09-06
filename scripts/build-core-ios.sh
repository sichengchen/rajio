#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Set DEVELOPER_DIR when Xcode is not the active developer directory.
for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  rustup target add "$target"
  cargo build --locked --release --target "$target" -p rajio-core
done
mkdir -p target/ios-simulator
xcrun lipo -create target/aarch64-apple-ios-sim/release/librajio_core.a target/x86_64-apple-ios/release/librajio_core.a -output target/ios-simulator/librajio_core.a
