#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: contact-sheet.sh <sheet.png> <render.png>..." >&2
  echo "  Tiles the renders in one row, then adds 128, 64 and 32 px copies of each below." >&2
  exit 2
fi

sheet=$1
shift
count=$#
tile=380
pad=8
bg='#808890'
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

magick montage "$@" -tile "${count}x1" -geometry "${tile}x${tile}+${pad}+${pad}" \
  -background "$bg" "$tmp/row.png"

cells=()
i=0
for img in "$@"; do
  for s in 128 64 32; do
    magick "$img" -resize "${s}x${s}" "$tmp/s-$i-$s.png"
  done
  magick -background "$bg" -gravity center \
    "$tmp/s-$i-128.png" "$tmp/s-$i-64.png" "$tmp/s-$i-32.png" +smush 24 \
    -extent "$((tile + 2 * pad))x160" "$tmp/cell-$i.png"
  cells+=("$tmp/cell-$i.png")
  i=$((i + 1))
done
magick "${cells[@]}" +append "$tmp/small.png"

magick "$tmp/row.png" "$tmp/small.png" -append -depth 8 -strip "$sheet"
echo "$sheet"
