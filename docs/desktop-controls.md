# Desktop playback controls

Right-click the cover artwork in the main playback bar and choose **Mini Player**. This is the miniplayer’s entry point. Closing it leaves playback running.

Click the Rajio mark in the macOS menu bar to open the menu-bar player. Right-click the mark for playback commands, Settings, Open Rajio, and Quit. The icon is a template rendition of the existing Icon Composer mark and follows the menu bar’s appearance.

The main renderer owns the audio element and listening session. Auxiliary windows send commands through the main process and display state published by that renderer. They never create an audio element. Progress broadcasts are limited to four per second; play/pause and episode changes publish immediately. Main-window closure hides the window, preserving playback and auxiliary controls. Explicit Quit saves a final checkpoint.

## Keyboard shortcuts

Settings has a single full-width scrolling layout. In Keyboard Shortcuts, click a binding to record new keys; Escape cancels and Backspace clears it. Changes save immediately. Choose **In Rajio** or **Global** for each action.

| Action | Default |
| --- | --- |
| Play/Pause | Space |
| Skip Back | Left arrow |
| Skip Forward | Right arrow |
| Next Episode | Command/Ctrl + Shift + Right arrow |

Global shortcuts require Command/Ctrl or Alt. Duplicate bindings, reserved editing/application shortcuts, and invalid combinations are rejected. If OS registration fails, the previous bindings remain saved and are registered again. Startup registration errors appear in Settings. In-app bindings respect text entry and focused interactive controls.

## Verification

Build the desktop app and start the deterministic fixture server:

```sh
pnpm --filter @rajio-app/desktop build
node scripts/ios-fixture-server.mjs
```

In another terminal, run the Electron integration harness with a Playwright installation:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-desktop-controls.mjs
```

The harness uses an isolated temporary library. It exercises actual audio play/pause/seek, the cover context menu, hidden-main-window controls, the tray click handler and native menu, persisted global registrations, duplicate rejection, simulated OS registration refusal with rollback, and the scroll-dependent page-header border. Screenshots are saved under `target/desktop-controls`.
