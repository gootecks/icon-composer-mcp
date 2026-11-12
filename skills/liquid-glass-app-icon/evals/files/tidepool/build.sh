#!/usr/bin/env bash
set -euo pipefail
swift build -c release
app=build/Tidepool.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp .build/release/Tidepool "$app/Contents/MacOS/Tidepool"
cp Info.plist "$app/Contents/Info.plist"
echo "built $app"
