# Desktop performance

Measured September 9, 2026 on macOS 27, Apple Silicon, Electron 39.8.10, using the production renderer and an isolated SQLite library of 5,000 episodes.

## Changes

- Show the application as soon as its renderer is ready. Artwork loads independently; an unavailable artwork server no longer holds the window closed for up to three seconds.
- Prefetch only the first episode artwork batch, using a limited SQLite query. Remove the full-library artwork download sweep.
- Restore favorites and the playback queue through an indexed episode-ID query instead of transferring the complete episode library to the renderer.
- Subscribe page layouts and Settings only to the state they display, preventing playback-clock updates from rerendering those trees.
- Load the compact player through a separate renderer entry. Its window does not initialize the library, router, or audio engine.

## Measurements

The controlled artwork endpoint responds after two seconds. “Cold artwork” means an application relaunch after clearing only this test library’s artwork cache. “Warm artwork” means relaunch with that cache retained. These are application starts, not operating-system cold boots.

| Measurement | Before | After |
| --- | --- | --- |
| Cold-artwork startup, median of 3 | 2,465 ms | 707 ms |
| Cold-artwork startup, samples | 2,465 / 2,458 / 2,580 ms | 1,811 / 707 / 692 ms |
| Warm-artwork startup, median of 3 | 700 ms | 695 ms |
| Warm-artwork startup, samples | 702 / 689 / 700 ms | 659 / 847 / 695 ms |
| Hidden-window reopen, median of 6 | 5 ms | 5 ms |

Cold-artwork startup improved by approximately 71% in this fixture. Warm-cache startup was essentially unchanged. The first optimized cold sample was slower than the following two; all samples are retained above.

First navigation to Settings, Downloaded, Favorites, Search, and What’s New ranged from 5–97 ms before and 6–76 ms after. Navigation timing ends when the route heading or Search input becomes visible; it does not measure completion of every image or network request. These small samples establish a reproducible baseline rather than a claim of statistically significant navigation improvement.

## Reproduction

```sh
pnpm --filter @rajio-app/desktop build
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node scripts/benchmark-desktop.mjs target/desktop-benchmark.json
```

`BENCH_EPISODES` changes the library size. The harness creates its own local feed/artwork server and isolated data directory. It records six launches, first route visits, and six hidden-window reopens. Results include raw samples, platform, architecture, and timestamp.

## Rust assessment

Rust already owns parsing, episode reconciliation, and library rules. The measured startup delay came from waiting on network artwork, so moving more code to Rust would not address it. SQLite’s indexed selection query also removes unnecessary data transfer before a language change is relevant. Keep native/Wasm contract tests alongside these benchmarks when changing domain execution.

## Startup phase profile

Five additional launches recorded internal timestamps. Median time from process launch was 175 ms to Electron readiness, 187 ms to database readiness, 309 ms to window creation, 413 ms to window visibility, 501 ms to first contentful paint, and 506 ms to library initialization completion. Database initialization itself took 2 ms. These internal timestamps distinguish rendering from automation observation overhead in the benchmark above; window visibility precedes meaningful content.

Use `RAJIO_PROFILE_DATA=/absolute/path/to/isolated/test-data PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/profile-desktop-startup.mjs` after building to collect phase timings. The next investigation areas are initialization before window creation, initial renderer module evaluation, and library IPC hydration.
