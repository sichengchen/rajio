# Shared Rust core

Rajio’s desktop and iOS clients use `crates/rajio-core`. It builds as a native library for Swift and as WebAssembly for Electron and Cloudflare Workers. Hosts own feed fetching, timestamps, persistence, and audio playback.

## Packages

| Path                               | Responsibility                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `crates/rajio-core`                | RSS/Atom/RDF parsing, identity reconciliation, library reducers, JSON boundary |
| `packages/core-wasm`               | TypeScript declarations and Wasm initialization/parsing API                    |
| `packages/core-swift`              | Swift Codable models and an ownership-managed C ABI wrapper                    |
| `apps/server/test/core-worker.mjs` | Hono/Workers runtime integration harness                                       |

Desktop production parsing runs through Rust/Wasm; iOS uses the same Rust implementation through its native binding. Golden fixtures preserve the previous desktop behavior and cover RSS, Atom, Unicode, missing metadata, and empty channels. Native Rust, Swift, Electron/Wasm, and Workers/Wasm all consume these fixtures.

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

The test command runs native Rust, Node/Wasm, and the local Workers runtime. On macOS it also runs the Swift package tests and Wasm fixtures inside Electron. Select a matching Xcode toolchain with `DEVELOPER_DIR` when testing Swift. The Swift harness runs on the host; the iOS application uses this wrapper; see [iOS development](../apps/ios/README.md) for native artifact builds and GRDB tests.

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

## Library rules and persistence

Both clients call Rust for subscription decisions, episode identity reconciliation, listening checkpoints, and collection mutations/normalization. Reconciliation preserves existing episode IDs and progress when feeds reorder entries or publishers change media URLs. Favorites and queue normalization preserves order, removes duplicates and empty identities, and applies the shared limits.

Electron’s SQLite adapter and iOS’s GRDB adapter own their platform schemas and migrations. Each adapter commits the local mutation and its outbox intent in one transaction. Rollback fixtures verify that a failed outbox write also rolls back the local change. Reopening storage preserves the resulting library, collections, selection, and progress.

The parser validates XML structure and rejects DTDs, supports namespace aliases and RDF sibling items, and parses RFC 3339/RFC 2822 dates. The original UTF-16-based hashes remain compatible with persisted desktop IDs; host adapters supply existing records to the reconciliation operation.

Milestone C adds server-ordered synchronization operations and deterministic merges on Workers/D1. Milestone E adds selected-device playback coordination. Local versioned outbox intents are the persisted input to that work; hosts continue to own network transport, credentials, database transactions, and audio execution.
