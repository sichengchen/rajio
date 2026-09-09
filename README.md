# Rajio

An open-source podcast player for desktop and iOS. Each client stores its library locally and supports direct RSS, downloads, and playback independently of a Rajio backend.

## Tech Stack

- Electron, React, and Vite for desktop
- SwiftUI and GRDB for iOS
- Shared Rust domain engine, native Swift bindings, and WebAssembly bindings
- SQLite persistence and atomic local outboxes
- Hono
- Drizzle ORM
- Cloudflare Workers + D1 for the reference sync backend

## Workspace

- `apps/desktop`: Electron desktop app
- `apps/ios`: native iOS app, generated with XcodeGen
- `crates/rajio-core`: shared parsing, identity, and library rules
- `packages/core-swift`, `packages/core-wasm`: native and Wasm bindings
- `packages/ios-library`: GRDB persistence adapter
- `apps/server`: optional sync backend
- `packages/contracts`: `@rajio-app/contracts`, the shared API and sync contracts

## Desktop App (`apps/desktop`)

Install the pinned Rust/Wasm tools once (stored in the ignored `.tools` directory):

```bash
pnpm setup:desktop
```

Local development:

```bash
pnpm --filter @rajio-app/desktop dev
```

Build:

```bash
pnpm --filter @rajio-app/desktop build
```

## iOS App (`apps/ios`)

Use Xcode 26.3 or newer, Rust 1.96.0, and XcodeGen:

```sh
xcodegen generate --spec apps/ios/project.yml
open apps/ios/Rajio.xcodeproj
```

The Rajio scheme builds the native Rust library automatically. See [iOS development and verification](apps/ios/README.md).

## Sync Backend (`apps/server`)

`@rajio-app/server` is a sync backend for:

- subscriptions
- playback checkpoints and history
- current cross-device resume position
- syncable playback preferences

Local development:

```bash
pnpm --filter @rajio-app/server dev
```

Production deployment:

```bash
pnpm cf:deploy
```

The deployment script creates or reuses the D1 database, applies migrations, deploys the server Worker, and prints the sync endpoint plus bearer token for Rajio desktop settings.

## Quick Start

```bash
pnpm install
pnpm dev
```

Checks and tests:

```bash
pnpm check
pnpm test
```

## Additional Docs

- [Product roadmap](docs/ROADMAP.md)
- [Shared Rust core: build, bindings, and tests](docs/shared-core.md)
- [Export OPML from Cosmos (小宇宙)](docs/opml-cosmos.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
