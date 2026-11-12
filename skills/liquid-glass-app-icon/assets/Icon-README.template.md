# App icon

<One sentence: what the icon shows and why it fits the app.>

`<App>.icon` is an Icon Composer bundle. `<build script or Xcode target>` compiles it
with `actool` into `Assets.car` (macOS 26+) and `<App>.icns` (older systems).
This step needs Xcode 26 or later.

- `<App>.icon/Assets/` holds one SVG per layer.
- `<App>.icon/icon.json` holds layer order, glass settings, and the fills. The first
  group and the first layer in each list are the top ones.
- `previews/sheet.png` shows the macOS renders: light, dark, tinted light, tinted dark,
  each with 128, 64 and 32 px copies.
- `previews/marketing-1024.png` is an opaque 1024 px render.

## Groups

| Group       | Layers              | Notes                                         |
| ----------- | ------------------- | --------------------------------------------- |
| <top group> | <layers, top first> | <glass on or off, shadow, why it is separate> |

## Colors

<Hex values and where they come from. Name the owner of any third-party logo or trademark.>

## Rendition quirks

<Anything that differs between renditions, such as an accent that turns black in tinted mode.>

## Editing

Edit with Icon Composer or the `icon-composer` MCP tools, then re-render the previews.
Build the app before committing, because `actool` validates rules that the preview
renderer does not. It rejects more than four visible groups.
