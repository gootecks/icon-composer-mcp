#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: render-renditions.sh <bundle.icon> <out_dir> [platform: macOS|iOS|watchOS] [size]" >&2
  exit 2
fi

bundle=$1
out=$2
platform=${3:-macOS}
size=${4:-1024}

mkdir -p "$out"
for rendition in Default Dark TintedLight TintedDark; do
  icon-composer render "$bundle" "$out/$rendition.png" \
    --platform "$platform" --rendition "$rendition" --width "$size" --height "$size" >/dev/null
  echo "$out/$rendition.png"
done
