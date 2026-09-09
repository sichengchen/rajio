# Rajio for iOS

SwiftUI application using native `RajioCore` RSS parsing and `RajioLibrary` GRDB storage. The library and audio player operate without a Rajio server or account.

## Development

Install Xcode 26.3 or newer, Rust 1.96.0, and XcodeGen (`brew install xcodegen`). The app supports iOS 17 and newer; native Liquid Glass controls use iOS 26 APIs, and the tab accessory uses iOS 26.1 APIs. Select Xcode with `xcode-select` or set `DEVELOPER_DIR` to its `Contents/Developer` directory.

From the repository root:

```sh
xcodegen generate --spec apps/ios/project.yml
open apps/ios/Rajio.xcodeproj
```

Select the Rajio scheme and an iPhone simulator. Its pre-build phase builds the Rust artifacts automatically; Rust/rustup must be installed and available on PATH or in ~/.cargo/bin. For a physical device, select a development team in Xcode. The build script creates a device static library and a universal Intel/Apple Silicon simulator static library. Generated projects and libraries are ignored; `project.yml` owns project configuration.

```sh
cargo build --locked -p rajio-core
swift test --package-path packages/ios-library --scratch-path target/ios-library \
  -Xlinker -L -Xlinker "$PWD/target/debug"
xcodebuild -project apps/ios/Rajio.xcodeproj -scheme Rajio \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath target/ios CODE_SIGNING_ALLOWED=NO build
```

## Client capabilities

- Direct catalog search, RSS entry, OPML import/export, subscriptions, show and episode details, linked show notes, favorites, and an ordered queue.
- Native Rust parsing, episode reconciliation, library reducers, and collection normalization. GRDB persists local mutations and pending operations in the same transaction.
- Background URLSession downloads with cancel/retry, storage limits, file cleanup, and interrupted/missing-file recovery. AVPlayer prefers downloaded media.
- Streaming, seeking, playback speed, atomic listening checkpoints, and selected-episode restoration in a paused state after relaunch.
- Background audio, Now Playing metadata and remote commands, interruption handling, and output-route recovery.
- Conditional feed refresh, bounded concurrency, retry/backoff, foreground refresh, and scheduled background opportunities.
- Native SwiftUI navigation, forms, lists, sheets, player controls, and a Liquid Glass tab accessory. [Design conventions](DESIGN.md) follow Apple’s Human Interface Guidelines.
- System and manual language selection for English, Simplified Chinese, Traditional Chinese, Japanese, French, Spanish, and German; light/dark appearance and Dynamic Type.
- Editable Icon Composer source in `Sources/Resources/Rajio.icon`, shared with the desktop icon pipeline.

Feeds and media are fetched directly, including user-entered HTTP sources. Local use requires no Rajio account or backend. Milestone C connects the local outbox to the multi-user synchronization protocol.

## Simulator verification

Start the deterministic RSS/media fixture server in a separate terminal:

```sh
node scripts/ios-fixture-server.mjs
```

Then run the native recovery and UI acceptance suites on a selected simulator:

```sh
xcodebuild -project apps/ios/Rajio.xcodeproj -scheme Rajio \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' \
  -parallel-testing-enabled NO -derivedDataPath target/ios \
  CODE_SIGNING_ALLOWED=NO test
```

Run these UI tests serially: they change the fixture server’s online/offline state. Tests use isolated libraries and cover offline listening, persisted progress, download recovery, native navigation, seven languages, manual language persistence, and dark appearance with accessibility text sizes. See the [Milestone B verification record](../../docs/milestone-b-verification.md).
