#!/bin/bash
# Export the shared Icon Composer source for Electron. iOS compiles it with Xcode.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
developer_dir="${DEVELOPER_DIR:-$(xcode-select -p)}"
composer_tool="$developer_dir/../Applications/Icon Composer.app/Contents/Executables/ictool"
icon_source="$repo_root/apps/ios/Sources/Resources/Rajio.icon"
resources="$repo_root/apps/desktop/resources"
icon_output="$(mktemp -d)"
trap 'rm -rf "$icon_output"' EXIT
"$composer_tool" "$icon_source" --export-image --output-file "$resources/icon.png" \
  --platform macOS --rendition Default --width 1024 --height 1024 --scale 1
xcrun actool "$icon_source" --compile "$icon_output" --platform macosx \
  --minimum-deployment-target 12.0 --app-icon Rajio \
  --output-partial-info-plist "$icon_output/info.plist"
cp "$icon_output/Assets.car" "$resources/Assets.car"
cp "$icon_output/Rajio.icns" "$resources/Rajio.icns"

# actool adds the macOS safe-area inset; the Composer PNG export is full bleed.
# Use the compiled macOS rendition for Electron development Dock icons.
sips -s format png "$icon_output/Rajio.icns" --out "$resources/icon-macos.png" >/dev/null
