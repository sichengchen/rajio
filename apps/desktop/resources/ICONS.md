# App icon

The shared editable source is `apps/ios/Sources/Resources/Rajio.icon`.
Open it in Icon Composer to edit the vector mark, glass material, lighting, and appearance variants.

With Xcode 26 or newer selected, regenerate desktop assets from the repository root:

```sh
bash scripts/build-app-icons.sh
```

Commit the generated `icon.png`, `icon-macos.png`, `Rajio.icns`, and `Assets.car` together.
Electron packages the compiled catalog and declares `CFBundleIconName=Rajio`, allowing macOS to render the layered icon. The ICNS file supports earlier macOS versions. macOS development windows use `icon-macos.png`, extracted from the compiled ICNS to retain the system’s safe-area inset; packaged apps retain the system-rendered Dock icon.

XcodeGen includes the same `.icon` document in the iOS target and selects it as the app icon. Xcode generates iOS appearance variants and compatibility assets during the build.
