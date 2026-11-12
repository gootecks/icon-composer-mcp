---
name: liquid-glass-app-icon
description: "Design, build and ship an Apple app icon as an Icon Composer .icon bundle with Liquid Glass, using the icon-composer MCP tools or CLI. Use whenever the user wants an app icon made, redrawn or modernised for macOS, iOS or watchOS, mentions Icon Composer, .icon, AppIcon, .icns, Liquid Glass, or dark and tinted icon variants, needs an icon wired into an Xcode or script-built app, or needs the 1024 px App Store PNG, even if they only say 'make an icon for my app'."
---

# Liquid Glass app icon

Design an app icon as an Icon Composer `.icon` bundle with the `icon-composer` MCP
tools (or the `icon-composer` CLI, which has the same operations).
Work in rounds: draw concepts, render them, let the user pick, then refine.

## Prerequisites

- Icon Composer must be installed for Liquid Glass renders. It ships inside Xcode 26+
  (`Xcode.app/Contents/Applications/Icon Composer.app`). Run `icon-composer doctor` to check.
- Without it, previews fall back to a flat composite with no glass. Tell the user, because
  they cannot judge a glass icon from a flat preview.
- The scripts need ImageMagick (`magick`) and the `icon-composer` CLI on `PATH`.

## Bundled files

Paths are relative to this skill's folder.

| File                             | Use it when                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `scripts/render-renditions.sh`   | Rendering Default, Dark, TintedLight and TintedDark in one call          |
| `scripts/contact-sheet.sh`       | Tiling renders into one sheet with 128, 64 and 32 px copies              |
| `scripts/actool-check.sh`        | Testing that the bundle compiles the way an app build compiles it        |
| `assets/example/`                | You want a finished bundle to copy structure from; start with its README |
| `assets/Icon-README.template.md` | Writing the app repo's `Icon/README.md`                                  |
| `references/design-notes.md`     | Before drawing concepts, and before showing a round                      |
| `references/appearances.md`      | A layer must keep its color, dark or tinted looks wrong, textures, depth |
| `references/wiring.md`           | Adding the bundle to an Xcode project or a script-built app              |

## Workflow

1. **Brief.** Read the app's README and UI palette. Write down one sentence on what
   the app does, its accent color, and whether its UI is light or dark.
   Ask the user for brand assets (logo SVGs, a palette) and reference images before
   drawing anything.
2. **Sources.** Keep everything in the app repo under `Icon/`: the bundle at
   `Icon/<App>.icon` and renders in `Icon/previews/`. Draw layer SVGs in a scratch
   folder; the bundle copies them into its `Assets/`.
   Put throwaway concept rounds in `/tmp`, or in `Icon/concepts/` if the user wants to
   open the files, and delete that folder once a concept is picked.
   If another session has uncommitted work in the app repo, do not touch that working
   tree. Work in `/tmp`, and for the final commit use
   `git worktree add ../<repo>-icon -b feat/<N>-app-icon origin/main`.
3. **Concepts.** Read `references/design-notes.md`. Draw three glyph SVGs that differ in
   idea, not just in detail. Follow the glyph rules below. One SVG per concept is fine
   at this stage.
4. **Build.** For each concept call `create_icon` with `glyph_scale: 1.0`, then `set_fill`.
5. **Render.** Call `render_liquid_glass` with `platform` set to the target
   (`macOS` for Mac apps), `width` and `height` 1024. The appearance parameter is
   named `rendition`; render `Default` for concepts.
6. **Contact sheet.** Put one `Default` render per concept on a sheet and look at it
   before showing the user. Fix anything broken first.

   ```bash
   scripts/contact-sheet.sh Icon/concepts/sheet.png a/Default.png b/Default.png c/Default.png
   ```

7. **Pick.** Show the sheet, give a recommendation with a reason, and let the user choose
   the concept and the background (brand-color tile or neutral tile).
8. **Final bundle.** Rebuild the picked concept from per-layer SVGs (next section), then
   render all four renditions, make the sheet, and compile with `actool` before the user
   signs off. `actool` enforces rules that the preview renderer ignores.

   ```bash
   scripts/render-renditions.sh Icon/App.icon /tmp/app-renders macOS
   scripts/contact-sheet.sh Icon/previews/sheet.png /tmp/app-renders/{Default,Dark,TintedLight,TintedDark}.png
   scripts/actool-check.sh Icon/App.icon
   ```

   If a rendition looks wrong, read `references/appearances.md`.

9. **Wire in.** Read `references/wiring.md`, add the bundle to the app, build, and check
   the built icon.
10. **Export and document.** Produce the 1024 opaque PNG (see "App Store export") and
    write `Icon/README.md` from `assets/Icon-README.template.md`.

## Final bundle from per-layer SVGs

Splitting one SVG is quick for concepts. For the final icon, give each layer its own
SVG file so each can carry its own gradient and be edited alone.
`assets/example/SlabVideo.icon` is a finished bundle built this way.

1. `create_icon` with the main layer, `glyph_scale: 1.0`, and `split_layers: false`.
   It always names the asset `foreground.svg` and the layer `glyph`.
2. `add_layer_to_icon` for each further layer, with a meaningful `layer_name`. Use
   `create_group: true` for a layer that should sit at a different depth, such as a
   backdrop shape, and set its `opacity` there.
3. Order runs top first, for both `groups` and each group's `layers` array.
   `add_layer_to_icon` appends, which puts the new layer or group **under** the existing
   ones. Reorder the arrays in `icon.json` where needed.
4. A new group has no glass settings. Call `set_glass_effects` with its `group_index`.
5. `set_fill` for the background, then render all four renditions.

SVG `linearGradient` fills inside a layer keep their colors and direction in every rendition.

### Group limit

`actool` rejects a bundle with more than four visible groups ("Too many visible groups").
`render_liquid_glass` renders five or six without complaint, so the error only shows
at build time. Plan for four groups at most, and run `scripts/actool-check.sh` to confirm.

- Layers in one group share glass settings and cast no shadow on each other.
- Spend the groups on the shadows that matter most, such as a button over its base.
- Merge the rest with `move_layer` into one group, top layer first.

## Glyph SVG rules

- Use a `viewBox="0 0 1024 1024"` canvas and draw the glyph at its final size and position.
  Keep important shapes inside roughly 100 to 924 on both axes. At scale 1.0 the canvas
  maps about one to one onto the rendered tile.
- Use filled `<path>` or `<circle>` shapes only. Stroke-only paths render as solid black
  fills, so convert every stroke to a filled outline. Do not use `<text>`.
- Draw the glyph in white (`#FFFFFF`). Icon Composer recolors white layers with the
  background fill in the Dark rendition, which gives a colored glyph on a dark tile for free.
  Colored shapes, such as a red dot, keep their color in every rendition except tinted.
- Each top-level shape becomes its own glass layer. The first shape in the file is the
  top layer, which is the reverse of SVG paint order. Put accents first and backdrops last.
- `fill-opacity` in the SVG is ignored. Set `opacity` on the layer in `icon.json` instead.
- A cut-out drawn with `fill-rule="evenodd"` works, and shows whatever layer is behind it.
  Keep lower layers out from under the hole if the background should show through.
- Overlapping sub-paths inside one `<path>` can cancel each other and leave a hole.
  Give each piece its own `<path>`. Each one then also gets its own gradient sheen.
- To reuse an official logo path at another size, bake the transform into the path
  instead of using `transform`. If the path uses relative commands and has no arcs,
  multiply every number by the scale, and map only the first `m` pair with
  `(v - center) * scale + target`.

## Tool gotchas

- `create_icon` defaults `glyph_scale` to 1.75, which blows a full-canvas glyph past the
  icon edge. Always pass `glyph_scale: 1.0`. `add_layer_to_icon` defaults to `1.0`.
- If a split-layer glyph renders at about 40% size, the installed `icon-composer` is
  older than the fix for viewBox-only SVGs. Update it, or pass `glyph_scale: 2.56`.
- `set_fill` with `fill_type: "gradient"`: `color` renders at the **top** and `color2`
  at the bottom when `gradient_angle` is 0.
- `move_layer` moves a layer to another group or position. With `create_group: true` the
  new group goes on top unless `to_group_index` says otherwise.
- `export_preview` renders the iOS shape only. Use `render_liquid_glass` with
  `platform: "macOS"` to see the macOS tile.
- Pass `return_image: false` when the agent cannot display inline images, then read the PNG file.
- Do not run `set_fill` and a render in parallel. The render can read the bundle before the fill lands.
- An unknown parameter is ignored without an error. If all four renditions look the
  same, check the parameter name (`rendition`, not `appearance`).
- The `icon-composer` CLI has the same operations when the MCP tools are not connected.
  Parameters become flags (`glyph_scale` is `--glyph-scale`, `split_layers: false` is
  `--no-split-layers`); run `icon-composer <command> --help` for the rest.

## App Store export

- A Mac app needs no separate upload: App Store Connect takes the icon from the build.
- `export_marketing` writes the opaque, square 1024 PNG. It renders with Liquid Glass
  through `ictool` and fills the transparent corners from a flat composite of the same
  layers. A faint rim stays visible at the corners. Check the result with
  `sips -g hasAlpha marketing-1024.png`.
- Without Icon Composer, or with `flat: true`, it writes the flat composite alone: correct
  layout and fill, no glass.
- Versions before the gootecks fork's PR #4 shrink the glyph, drop the gradient fill and
  reverse the layer order. If the output looks like that, rebuild the binaries with
  `mise run install` in the icon-composer-mcp checkout.

## Keeping the repo small

- The bundle's `Assets/` folder is the source of truth for layers. Do not keep a second
  copy of the SVGs.
- Commit the contact sheet and the marketing PNG, not every 1024 px render.
- ImageMagick writes composites as 16-bit PNGs. `scripts/contact-sheet.sh` already adds
  `-depth 8 -strip`; add it to any other `magick` command. A 1024 px icon went from
  1.8 MB to 0.5 MB.
