#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: actool-check.sh <bundle.icon> [platform: macosx|iphoneos] [min_target]" >&2
  echo "  Compiles the bundle the way an app build does and writes icns.png beside the results." >&2
  exit 2
fi

bundle=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
platform=${2:-macosx}
target=${3:-}
name=$(basename "$bundle" .icon)
out=$(mktemp -d)

if [ -z "$target" ]; then
  if [ "$platform" = macosx ]; then target=14.0; else target=17.0; fi
fi

status=0
log=$(xcrun actool "$bundle" --compile "$out" --app-icon "$name" \
  --platform "$platform" --minimum-deployment-target "$target" \
  --output-partial-info-plist "$out/partial.plist" 2>&1) || status=$?

if [ "$status" -ne 0 ] || grep -Eq 'error:|actool\.(document\.)?errors' <<<"$log"; then
  messages=$(grep -A1 -E '<key>(message|description)</key>' <<<"$log" |
    sed -n 's/.*<string>\(.*\)<\/string>.*/\1/p')
  echo "${messages:-$log}" >&2
  echo "actool rejected $bundle" >&2
  exit 1
fi

grep 'warning:' <<<"$log" >&2 || true

if [ -f "$out/$name.icns" ]; then
  sips -s format png "$out/$name.icns" --out "$out/icns.png" >/dev/null
fi
echo "actool accepted $bundle"
ls "$out"
echo "$out"
