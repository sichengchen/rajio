# Shared Rust core

The first milestone-A implementation extracts RSS parsing into `crates/rajio-core`. It builds as a native library for Swift and as WebAssembly for Electron and Cloudflare Workers. Hosts own feed fetching, timestamps, persistence, and audio playback.

## Packages

| Path                               | Responsibility                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `crates/rajio-core`                | Podcast and episode records, deterministic RSS/Atom/RDF parsing, JSON boundary |
| `packages/core-wasm`               | TypeScript declarations and Wasm initialization/parsing API                    |
| `packages/core-swift`              | Swift Codable models and an ownership-managed C ABI wrapper                    |
| `apps/server/test/core-worker.mjs` | Hono/Workers runtime integration harness                                       |

The existing desktop parser remains the production implementation until the client migration in milestone B. Golden fixtures were captured from it and cover RSS, Atom, Unicode, missing metadata, and empty channels. Native Rust, Swift, Electron/Wasm, and Workers/Wasm all consume these fixtures.

## Build and test

Install Rust 1.96.0 with the Wasm target and matching binding generator:

```sh
rustup toolchain install 1.96.0
rustup override set 1.96.0
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
pnpm install --frozen-lockfile
node scripts/test-core.mjs
```

The test command runs native Rust, Node/Wasm, and the local Workers runtime. On macOS it also runs the Swift package tests and Wasm fixtures inside Electron. Select a matching Xcode toolchain with `DEVELOPER_DIR` when testing Swift. The Swift harness runs on the host; The iOS application now uses this wrapper; see [iOS development](../apps/ios/README.md) for native artifact builds and GRDB tests.

Individual commands:

```sh
cargo test --locked --workspace
node scripts/build-core-wasm.mjs
node --test packages/core-wasm/test/feed.test.mjs
node --test apps/server/test/core-wasm.test.mjs
cargo build --locked -p rajio-core
swift test --package-path packages/core-swift --scratch-path target/swift \
  -Xlinker -L -Xlinker "$PWD/target/debug"
```

Generated Wasm and native artifacts live in ignored build directories. Commit `Cargo.lock` to keep native and Wasm builds aligned. The binding generator version must match the crate version in `Cargo.toml`.

## Host interface

The request contains `feedUrl`, `xml`, and an RFC 3339 `fetchedAt` timestamp. Rust returns podcast and episode records with camel-case field names. Optional fields are omitted from JSON. The low-level response is either `{ "value": ... }` or `{ "error": "..." }`; Swift and TypeScript wrappers expose typed results and thrown errors.

Electron initializes Wasm from bytes. Workers supplies a statically imported `WebAssembly.Module` to `initializeCore`; this follows the Workers module-loading model. The wrapper performs synchronous initialization, then `parseFeed(request)` calls the shared engine.

Swift uses `RajioCore.parseFeed(feedUrl:xml:fetchedAt:)`. The wrapper borrows UTF-8 input for the call and releases every Rust response through `rajio_core_free`. Link the Rust library built for the consuming Apple target. The iOS build script produces device and universal simulator static libraries. The `packages/ios-library` GRDB adapter persists parsed records and local outbox intents atomically.

## Compatibility and next steps

The extraction preserves the desktop's UTF-16-based hash and audio-URL/position-based episode IDs. A stable identity scheme requires an explicit persisted-data migration before replacing those IDs.

The Rust parser validates XML structure and rejects DTDs, supports namespace aliases and RDF sibling items, and parses RFC 3339/RFC 2822 dates. Expand feed fixtures before migrating production parsing, particularly for publisher-specific date formats and malformed feeds tolerated by the existing parser.

Next milestone-A work adds library reducers, synchronization operation types, and persistence transaction contracts. Milestone B integrates these APIs with Electron/SQLite and SwiftUI/GRDB. Milestone C adds shared synchronization merges and D1 operations; milestone E adds selected-device playback transitions.
