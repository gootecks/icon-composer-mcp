# Accents, dark mode, tinted mode, textures

Read this when a layer must keep its own color, when the dark or tinted rendition looks
wrong, or when the tile needs a texture or a 3D-looking object.

## Contents

- Colored accents
- Tinted mode
- Dark mode and the tile fill
- Textures
- Depth

## Colored accents

Glass translucency washes out small colored accents: a red dot turns pink.
Move the accent into its own top group and turn the glass off:

- group: `specular: false`, shadow `none`, translucency disabled
- layer: `glass: false`

The first entry in `groups` is the top group. No tool moves an existing layer between
groups, so edit `icon.json`: cut the layer's entry out of its group's `layers` array and
add this as the first entry of `groups`, with the layer entry unchanged apart from `glass`:

```json
{
  "name": "Accent",
  "layers": [
    {
      "image-name": "dot.svg",
      "name": "dot",
      "glass": false,
      "position": { "scale": 1, "translation-in-points": [0, 0] }
    }
  ],
  "specular": false,
  "shadow": { "kind": "none", "opacity": 0 },
  "translucency": { "enabled": false, "value": 0 }
}
```

It then renders as a solid color. `assets/example/SlabVideo.icon` does this for its red dot.

The Dark rendition shows the exact SVG color. The Default rendition lightens every
color by a few percent, the tile fill included (`#FF7A1A` measures about `#EE8239`).
That comes from the renderer and no bundle setting changes it.

## Tinted mode

Tinted renditions recolor every layer with one system hue by luminance. No layer can
keep its own color there, so tell the user that before they pick a concept that
depends on color.

To keep an accent readable, give it a tinted fill override:
`set_appearances` with `target: "layer"`, `appearance: "tinted"`, `fill_color: "#000000"`,
plus the layer's `group_index` and `layer_index`. Use the tool; do not hand-write the
`fill-specializations` entry.

- A black override renders as a black disc in TintedDark and as a mid-tone disc of the
  tint hue in TintedLight. Both read against a light glyph.
- White disappears on a light tinted glyph.
- One `tinted` override covers both TintedLight and TintedDark, so render both to check.

## Dark mode and the tile fill

- White layers are recolored with the background fill in the Dark rendition. Colored
  layers keep their color.
- A neutral (graphite) tile with a colored glyph looks almost the same in light and
  dark. That is fine; set the dark fill a step darker.
- `set_fill` with a gradient writes a top-level `fill` key. While that key exists,
  `fill-specializations` is ignored, including a dark override. For a gradient tile with
  a different dark tile, delete `fill` from `icon.json` and put both gradients in
  `fill-specializations`:

  ```json
  "fill-specializations": [
    { "value": { "linear-gradient": ["srgb:1,0.48,0.27,1", "srgb:0.83,0.09,0.18,1"],
                 "orientation": { "start": { "x": 0.5, "y": 1 }, "stop": { "x": 0.5, "y": 0 } } } },
    { "appearance": "dark",
      "value": { "linear-gradient": ["srgb:0.48,0.10,0.12,1", "srgb:0.23,0.04,0.05,1"],
                 "orientation": { "start": { "x": 0.5, "y": 1 }, "stop": { "x": 0.5, "y": 0 } } } }
  ]
  ```

  The first color is the top of the tile.

## Textures

The tile fill can only be a color or a gradient. For a texture:

- Add a full-bleed 1024 px PNG as the only content of the bottom group, with
  `glass: false` on the layer, `specular: false` and shadow `none` on the group.
- For a dark variant, add a second PNG under the first in the same group, then hide the
  top one in dark mode: `set_appearances` with `target: "layer"`, `appearance: "dark"`,
  `hidden: true`.
- Quantize texture PNGs: `magick in.png -colors 24 -strip PNG8:out.png`. This took a
  2 MB speckle texture down to about 150 KB.

The texture group counts toward the four-group limit.

## Depth

- A convex button is two groups: a base circle with a top-to-bottom linear gradient,
  and a smaller circle above it with an off-center `radialGradient` (light at about 40%
  across, 30% down). The group shadow between them supplies the depth.
- A saturated color shows dome shading far better than black.
- For steel, use a four-stop diagonal gradient: `#E6EAF0`, `#8A94A4` at 42%,
  `#C3CAD5` at 56%, `#565F6E`.
