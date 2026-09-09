# Milestone B verification

Verification date: September 8, 2026. App version: 0.10.1 (1).

## Delivered clients

Desktop and iOS use the shared Rust domain engine for parsing, identity reconciliation, and library rules. Electron/SQLite and SwiftUI/GRDB own local persistence, downloads, network transport, and playback. Local mutations and pending outbox intents commit atomically. Both clients operate independently of a Rajio account or backend.

The iOS interface uses native navigation, forms, lists, sheets, semantic system typography, adaptive layouts, and Liquid Glass controls. The editable Icon Composer document supplies the iOS icon and macOS icon artifacts. See [iOS design conventions](../apps/ios/DESIGN.md).

## Environments

| Environment | Configuration |
| --- | --- |
| iPhone Simulator | iPhone 17e and iPhone 17 Pro, iOS 27.0 |
| iPad Simulator | iPad Pro 11-inch (M5), iOS 27.0 |
| Local Apple toolchain | Xcode 27 beta, build 27A5237l; XcodeGen project generation |
| Physical installation | Signed arm64 build installed on iPhone Air, iOS 27 beta |
| Desktop | macOS on Apple Silicon, Electron 39.8.10 |
| Shared core | Rust 1.96.0, wasm-bindgen 0.2.100, native Swift and Wasm runtime harnesses |
| CI configuration | macos-15 with Xcode 26.3 for iOS; macos-14 for shared core and desktop |

## Results

| Area | Evidence | Result |
| --- | --- | --- |
| Rust rules and parser | 7 native tests; Clippy with warnings denied | Passed |
| Cross-runtime contracts | 5 Node/Wasm tests, 1 Workers harness, 2 Swift binding tests, 5 Electron/Wasm tests | Passed |
| GRDB persistence | 8 tests: reopen, refresh preservation, identity reconciliation, unsubscribe races, atomic outbox rollback, selection and collection durability | Passed |
| Desktop regression suite | 72 tests, TypeScript checking, production build | Passed |
| Desktop localization | Real Electron switches through all seven languages; French selection survives full application restart | Passed |
| macOS packaging | Unsigned arm64 application build; native icon catalog and padded development Dock icon checked | Passed |
| iPhone offline journey | Subscribe to fixture feed, open episode and linked notes, download, disable source, play and seek locally, pause, relaunch, restore saved progress | Passed |
| Download error UI | HTTP failure produces retry action | Passed on iPhone and iPad |
| Native navigation | Home, Library, Search, favorites and queue; native RSS form and iPad tab layout | Passed |
| iOS recovery | 4 native tests: missing/interrupted file reconciliation, cancellation persistence, deletion, storage quota before transfer | Passed |
| iOS localization | Seven system-selected languages at accessibility text sizes; manual French selection updates immediately and survives relaunch | Passed on iPhone and iPad |
| Appearance and adaptation | Dark appearance with populated library at accessibility text sizes; wrapping show rows; compact default iPhone player and episode typography | Passed in Simulator and screenshot review |
| Physical delivery | Signing, device build, and installation | Passed |

Physical UI tests were excluded at the user’s direction. Calls/Siri, Bluetooth hardware, and headphone controls were not exercised on the phone. Simulator checks cover the application workflows above; the deterministic source’s offline mode simulates publisher/network unavailability without changing device network settings.

## Reproduction

Run the shared contracts and persistence tests from the repository root:

```sh
cargo clippy --locked --workspace --all-targets -- -D warnings
node scripts/test-core.mjs
swift test --package-path packages/ios-library --scratch-path target/ios-library \
  -Xlinker -L -Xlinker "$PWD/target/debug"
pnpm --filter @rajio-app/desktop check
pnpm --filter @rajio-app/desktop test
pnpm --filter @rajio-app/desktop build
```

Generate the iOS project with XcodeGen and start `node scripts/ios-fixture-server.mjs` in a separate terminal. Run the Rajio scheme’s tests serially on a selected iPhone or iPad simulator. The fixture exposes RSS, ranged audio, failure responses, and an online/offline toggle. Each UI test uses an isolated local library. See [iOS build and test commands](../apps/ios/README.md).

The Xcode scheme includes `RajioTests` and `RajioUITests`; screenshots attach to `.xcresult` bundles. GitHub Actions uploads those bundles when a run fails. Local results include the iPhone acceptance run at `2026.09.08_23-37-13`, iPad navigation at `23-42-34`, localization at `23-44-44`, recovery at `23-50-09`, and the final adaptive-row check at `23-51-48` under `target/ios/Logs/Test`.

## Next integration

Milestone C adds Better Auth, isolated users/devices, and durable server-ordered synchronization on Cloudflare Workers/D1. The current local outboxes supply persisted mutation intents for that integration. Milestone E connects selected-device playback and acknowledged transfers through Durable Objects.
