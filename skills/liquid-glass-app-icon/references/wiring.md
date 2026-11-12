# Wiring the bundle into an app

Read this at the "Wire in" step. Pick the section that matches how the app is built.

## Xcode project

Set the target's App Icon to the bundle name (`ASSETCATALOG_COMPILER_APPICON_NAME`).

- If the app folder is a file-system synchronized group, put `<App>.icon` inside that
  folder. Xcode picks it up with no other project change.
- Otherwise drag the bundle into the project and add it to the app target.

Build, then look at the app in Finder or the Dock.

## Script-built app (SwiftPM, swiftc, a shell script)

Compile the bundle with `actool` into `Contents/Resources`, and add both icon keys to
`Info.plist`. This writes `Assets.car` for macOS 26+ and a `<App>.icns` fallback for
older systems.

```bash
xcrun actool "$PWD/Icon/App.icon" --compile "$PWD/$app/Contents/Resources" --app-icon App \
  --platform macosx --minimum-deployment-target 14.0 \
  --output-partial-info-plist /dev/null >/dev/null
```

Give `actool` absolute paths, as above. It resolves a relative bundle path against the
wrong folder and fails with "Failed to create a catalog".

```xml
<key>CFBundleIconFile</key><string>App</string>
<key>CFBundleIconName</key><string>App</string>
```

`actool` needs Xcode 26 or later, not just the Command Line Tools. To keep the build
working for people without it, let the icon step fail softly by ending the command with:

```bash
>/dev/null 2>&1 || echo "warning: app icon skipped" >&2
```

The two `Info.plist` keys are harmless when the icon files are missing.

The soft fail also hides real errors, so the build can exit 0 with no icon. After
wiring, confirm that `$app/Contents/Resources` holds `Assets.car` and `App.icns`. If it
does not, rerun the `actool` line without the redirects to see the message.

## Check the built icon

```bash
sips -s format png "$app/Contents/Resources/App.icns" --out /tmp/icns.png
```

Open `/tmp/icns.png` and compare it with the `Default` render. `scripts/actool-check.sh`
does the same compile into a temp folder without touching the app, which is the quick
way to test a bundle before the app build is wired up.

## iOS

Not covered. The steps above were only verified on Mac apps.
