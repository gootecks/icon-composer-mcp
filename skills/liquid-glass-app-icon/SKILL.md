---
name: liquid-glass-app-icon
description: "Use when designing an Apple app icon as an Icon Composer .icon bundle with the icon-composer MCP or CLI. Covers drawing SVG glyphs, Liquid Glass, dark and tinted modes, macOS previews, wiring into an app, and App Store export."
---

# Liquid Glass app icon

Design an app icon as an Icon Composer `.icon` bundle with the `icon-composer` MCP
tools (or the `icon-composer` CLI, which has the same operations).
Work in rounds: draw concepts, render them, let the user pick, then refine.

## Prerequisites

- Icon Composer must be installed for Liquid Glass renders. It ships inside Xcode 26+
  (`Xcode.app/Contents/Applications/Icon Composer.app`). Run `icon-composer doctor` to check.
- Without it, previews fall back to a flat composite with no glass.

## Workflow

1. **Brief.** Read the app's README and UI palette. Write down one sentence on what
   the app does, its accent color, and whether its UI is light or dark.
   Ask the user for brand assets (logo SVGs, a palette) before drawing anything.
2. **Sources.** Keep everything in the app repo under `Icon/`: the bundle at
   `Icon/<App>.icon` and renders in `Icon/previews/`. Draw layer SVGs in a scratch
   folder; the bundle copies them into its `Assets/`.
   Use `Icon/concepts/` for throwaway rounds and delete it once a concept is picked.
   If another session has uncommitted work in the app repo, do not touch that working
   tree. Draw in `/tmp`, and for the final commit use
   `git worktree add ../<repo>-icon -b feat/<N>-app-icon origin/main`.
3. **Concepts.** Draw three glyph SVGs that differ in idea, not just in detail.
   Follow the glyph rules below. One SVG per concept is fine at this stage.
4. **Build.** For each concept call `create_icon` with `glyph_scale: 1.0`, then `set_fill`.
5. **Render.** Call `render_liquid_glass` with `platform` set to the target
   (`macOS` for Mac apps), `width` and `height` 1024. The appearance parameter is
   named `rendition`; render `Default` for concepts.
6. **Contact sheet.** Tile the renders into one image with a row of small sizes under
   them, and look at it before showing the user. Fix anything broken first.
7. **Pick.** Show the sheet, give a recommendation with a reason, and let the user choose
   the concept and the background (brand-color tile or neutral tile).
8. **Final bundle.** Rebuild the picked concept from per-layer SVGs (see below), then
   render `Default`, `Dark`, `TintedLight`, and `TintedDark`.
   Compile it with `actool` now, before the user signs off. `actool` enforces rules
   that the preview renderer ignores.
9. **Wire in.** Add the bundle to the app (see below), build, and check the built icon.
10. **Export.** Produce the 1024 opaque PNG (see below).

## Final bundle from per-layer SVGs

Splitting one SVG is quick for concepts. For the final icon, give each layer its own
SVG file so each can carry its own gradient and be edited alone.

1. `create_icon` with the main layer, `glyph_scale: 1.0`, and `split_layers: false`.
2. `add_layer_to_icon` for each further layer. Use `create_group: true` for a layer
   that should sit at a different depth, such as a backdrop shape, and set its `opacity` there.
3. `add_layer_to_icon` appends, which puts the new layer **under** the existing ones in
   that group. Reorder the `layers` array in `icon.json` so the top layer is first.
4. A new group has no glass settings. Call `set_glass_effects` with its `group_index`.
5. `set_fill` for the background, then render all four renditions.

SVG `linearGradient` fills inside a layer render correctly and survive every rendition.

### Group limit

`actool` rejects a bundle with more than four visible groups ("Too many visible groups").
`render_liquid_glass` renders five or six without complaint, so the error only shows
at build time. Plan for four groups at most.

- Layers in one group share glass settings and cast no shadow on each other.
- Spend the groups on the shadows that matter most, such as a button over its base.
- Merge the rest by moving their entries into one group's `layers` array, top layer first.

### Textures and depth

- The tile fill can only be a color or gradient. For a texture, add a full-bleed
  1024 px PNG as the only content of the bottom group, with `glass: false` on the
  layer, `specular: false`, and shadow `none`.
- For a dark variant, add a second PNG under the first in the same group, then hide the
  top one in dark mode: `set_appearances` with `target: "layer"`, `appearance: "dark"`,
  `hidden: true`.
- Quantize texture PNGs (`magick in.png -colors 24 -strip PNG8:out.png`). This took a
  2 MB speckle texture down to about 150 KB.
- A convex button is two groups: a base circle with a top-to-bottom linear gradient,
  and a smaller circle above it with an off-center `radialGradient` (light at about
  40% across, 30% down). The group shadow between them supplies the depth.
- A saturated color shows dome shading far better than black.

## Wiring into an app

- **Xcode project:** set the target's App Icon to the bundle name
  (`ASSETCATALOG_COMPILER_APPICON_NAME`). If the app folder is a file-system
  synchronized group, put `<App>.icon` inside that folder and Xcode picks it up with no
  other project change. Otherwise drag it into the project.
- **Script-built app (SwiftPM, swiftc):** compile the bundle with `actool` into
  `Contents/Resources`, and add both icon keys to `Info.plist`. This writes `Assets.car`
  for macOS 26+ and a `<App>.icns` fallback for older systems. It needs Xcode 26+, not
  just the Command Line Tools.
  To keep the build working for people without Xcode 26, let the icon step fail softly:
  end the `actool` command with `>/dev/null 2>&1 || echo "warning: app icon skipped" >&2`.
  The two `Info.plist` keys are harmless when the icon files are missing.

  ```bash
  xcrun actool Icon/App.icon --compile "$app/Contents/Resources" --app-icon App \
    --platform macosx --minimum-deployment-target 14.0 \
    --output-partial-info-plist /dev/null >/dev/null
  ```

  ```xml
  <key>CFBundleIconFile</key><string>App</string>
  <key>CFBundleIconName</key><string>App</string>
  ```

- Check the result: `sips -s format png "$app/Contents/Resources/App.icns" --out /tmp/icns.png`.

## Accents, dark mode, and tinted mode

- Glass translucency washes out small colored accents (a red dot turns pink). Move the
  accent into its own top group with `specular: false`, shadow `none`, translucency
  disabled, and `glass: false` on the layer. It then renders as a solid color.
- Tinted renditions recolor every layer with one system hue by luminance. No layer can
  keep its own color there, so tell the user that up front.
- To keep an accent readable in tinted mode, give it a tinted fill override:
  `set_appearances` with `target: "layer"`, `appearance: "tinted"`, `fill_color: "#000000"`.
  Black reads as a cut-out in both TintedLight and TintedDark. White disappears on a
  light tinted glyph.
- One `tinted` override covers both TintedLight and TintedDark, so render both to check.
- A neutral (graphite) tile with a colored glyph looks almost the same in light and
  dark. That is fine; set the dark fill a step darker.
- `set_fill` with a gradient writes a top-level `fill` key, and the dark fill override
  is then ignored. For a gradient tile with a different dark tile, delete `fill` and put
  both gradients in `fill-specializations`:

  ```json
  "fill-specializations": [
    { "value": { "linear-gradient": ["srgb:1,0.48,0.27,1", "srgb:0.83,0.09,0.18,1"],
                 "orientation": { "start": { "x": 0.5, "y": 1 }, "stop": { "x": 0.5, "y": 0 } } } },
    { "appearance": "dark",
      "value": { "linear-gradient": ["srgb:0.48,0.10,0.12,1", "srgb:0.23,0.04,0.05,1"],
                 "orientation": { "start": { "x": 0.5, "y": 1 }, "stop": { "x": 0.5, "y": 0 } } } }
  ]
  ```

## Keeping the repo small

- The bundle's `Assets/` folder is the source of truth for layers. Do not keep a second
  copy of the SVGs.
- Commit the contact sheet and the marketing PNG, not every 1024 px render.
- Add a short `Icon/README.md` listing the layers and any rendition quirks.

## App Store export

- A Mac app needs no separate upload: App Store Connect takes the icon from the build.
- `export_marketing` uses the flat compositor, which does not match Icon Composer for
  multi-layer bundles: it shrinks the glyph, drops the gradient fill, and reverses the
  layer order. Look at its output before trusting it.
- Workaround for an opaque 1024 PNG that matches the real render: render with
  `render_liquid_glass` (`platform: "iOS"`, `Default`), then composite it over the
  background to remove the transparent corners. Use the background gradient, or the
  texture PNG if the icon has one (`magick texture.png ios.png -composite -alpha off out.png`).
  A faint rim stays visible at the corners.

  ```bash
  ffmpeg -y -loglevel error -f lavfi \
    -i "gradients=s=1024x1024:c0=0xTOPHEX:c1=0xBOTTOMHEX:x0=512:y0=0:x1=512:y1=1024:d=1" \
    -i ios.png -filter_complex "[0][1]overlay=format=auto,format=rgb24" -frames:v 1 marketing-1024.png
  sips -g hasAlpha marketing-1024.png
  ```

- ImageMagick writes these composites as 16-bit PNGs. Add `-depth 8 -strip`; a 1024 px
  icon went from 1.8 MB to 0.5 MB.

## Glyph SVG rules

- Use a `viewBox="0 0 1024 1024"` canvas and draw the glyph at its final size and position.
  Keep important shapes inside roughly 100 to 924 on both axes.
- Use filled `<path>` or `<circle>` shapes only. Stroke-only paths render as solid black
  fills, so convert every stroke to a filled outline. Do not use `<text>`.
- Draw the glyph in white (`#FFFFFF`). Icon Composer recolors white layers with the
  background fill in the Dark rendition, which gives a colored glyph on a dark tile for free.
  Colored shapes, such as a red dot, keep their color in every rendition.
- Each top-level shape becomes its own glass layer. The first shape in the file is the
  top layer, which is the reverse of SVG paint order. Put accents first and backdrops last.
- `fill-opacity` in the SVG is ignored. Set `opacity` on the layer in `icon.json` instead.
- A cut-out drawn with `fill-rule="evenodd"` works, and shows whatever layer is behind it.
  Keep lower layers out from under the hole if the background should show through.
- Overlapping sub-paths inside one `<path>` can cancel each other and leave a hole.
  Give each piece its own `<path>`. Each one then also gets its own gradient sheen.
- The 1024 canvas maps about one to one onto the rendered tile.
- The tile shape is set by the system: a rounded square on macOS and iOS, a circle only
  on watchOS. For a round look, draw a disc layer inside the tile.
- To reuse an official logo path at another size, bake the transform into the path
  instead of using `transform`. If the path uses relative commands and has no arcs,
  multiply every number by the scale, and map only the first `m` pair with
  `(v - center) * scale + target`.
- A third-party logo is usually a trademark. Say so when you propose it, and note the
  owner in `Icon/README.md`.

## Tool gotchas

- `create_icon` defaults `glyph_scale` to 1.75, which blows the glyph past the icon edge.
  Always pass `glyph_scale: 1.0` and check `position.scale` in `icon.json`.
- `set_fill` with `fill_type: "gradient"`: `color` renders at the **top** and `color2`
  at the bottom when `gradient_angle` is 0. The tool description says the opposite.
- `export_preview` renders the iOS shape only. Use `render_liquid_glass` with
  `platform: "macOS"` to see the macOS tile.
- Pass `return_image: false` when the agent cannot display inline images, then read the PNG file.
- Do not run `set_fill` and a render in parallel. The render can read the bundle before the fill lands.
- An unknown parameter is ignored without an error. If all four renditions look the
  same, check the parameter name (`rendition`, not `appearance`).

## Design notes

- Check each concept against well-known icons. A white rounded rectangle with a play
  triangle reads as YouTube; change the proportions or add a second element.
- One idea per icon. If the glyph needs explaining, it is too busy.
- A light-to-dark top-to-bottom gradient in the brand hue gives the glass something to refract.
- Judge the contact sheet at small size too. Details thinner than about 60 units on
  the 1024 canvas disappear at 32 px.
- A detailed backdrop works when one large object sits on top of it. Code lines turned
  into texture at 32 px while the magnifying glass over them still read clearly.
- Size the main object so its label (letters in a lens, for example) is readable at 64 px.
- A chain reads best as face-on link, edge-on link (a plain bar), face-on link.
  Two overlapping face-on links merge into a blob.
- A shape that overflows a disc must contrast with the tile as well as with the disc.
- For steel, use a four-stop diagonal gradient: `#E6EAF0`, `#8A94A4` at 42%,
  `#C3CAD5` at 56%, `#565F6E`.
- Ask the user for reference images early. A photo of the real object changed the
  concept more than three rounds of abstract options did.
- Show every round as a four-rendition sheet with a recommendation and a short list of
  choices. Offer "apply and finish" beside "apply and show me again".

## Contact sheet

Four renditions in a row, then 128, 64 and 32 px versions of `Default` underneath:

```bash
magick montage Default.png Dark.png TintedLight.png TintedDark.png \
  -tile 4x1 -geometry 380x380+8+8 -background '#808890' row.png
for s in 128 64 32; do magick Default.png -resize ${s}x${s} s$s.png; done
magick -background '#808890' -gravity center s128.png s64.png s32.png \
  +smush 40 -extent 1584x160 small.png
magick row.png small.png -append -depth 8 -strip sheet.png
```

For a concept round, put one `Default` render per concept in the top row instead.
