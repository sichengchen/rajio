# Rajio for iOS

SwiftUI application using native `RajioCore` RSS parsing and `RajioLibrary` GRDB storage. The library and audio player operate without a Rajio server or account.

## Development

Install Xcode, Rust, and XcodeGen (`brew install xcodegen`). Select Xcode with `xcode-select` or set `DEVELOPER_DIR` to its `Contents/Developer` directory.

From the repository root:

```sh
bash scripts/build-core-ios.sh
xcodegen generate --spec apps/ios/project.yml
open apps/ios/Rajio.xcodeproj
```

Select the Rajio scheme and an iPhone simulator. For a physical device, select a development team in Xcode. The build script creates a device static library and a universal Intel/Apple Silicon simulator static library. Generated projects and libraries are ignored; `project.yml` owns project configuration.

```sh
cargo build --locked -p rajio-core
swift test --package-path packages/ios-library --scratch-path target/ios-library \
  -Xlinker -L -Xlinker "$PWD/target/debug"
xcodebuild -project apps/ios/Rajio.xcodeproj -scheme Rajio \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath target/ios CODE_SIGNING_ALLOWED=NO build
```

## Implemented

- Add a publisher RSS URL, browse the persisted library and episodes, pull to refresh, and unsubscribe.
- Parse feeds through the native Rust core. The GRDB adapter stores the core's serialized records and preserves subscription dates and progress on refresh.
- Atomically save subscription/progress changes and pending local operations; test rollback through an injected outbox failure.
- Stream through AVPlayer, pause/resume, skip, persist checkpoints, and resume an episode from its saved position when selected again.
- Configure background audio and lock-screen play/pause/skip commands. Handle audio interruptions and disconnected output routes.
- Include system-selected English, Simplified/Traditional Chinese, Japanese, French, Spanish, and German strings for these screens.

## Remaining milestone B work

Downloads and offline media, catalog search, OPML, automatic refresh scheduling/cache validators/backoff, in-app language selection, complete player/error states, restored current-player selection, and physical-device lifecycle validation remain. Core library reducers and the durable sync operation model are also still pending; the local versioned checkpoint intent is not the milestone-C wire protocol. The GRDB schema is owned by this adapter; cross-adapter migration equivalence remains to be implemented with the shared reducers.

The transport configuration supports user-entered HTTP podcast feeds and media in addition to HTTPS. No backend proxy is involved.
