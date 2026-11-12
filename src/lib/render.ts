import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { IconManifest } from '../types';
import { resolveFlatBackground, buildLayerOverlays } from './flat-compose';

// Generate a checkerboard pattern as a PNG buffer
export async function generateCheckerboard(size: number, cellSize: number = 32): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(size * size * channels);
  const lightGray = { r: 204, g: 204, b: 204 };
  const white = { r: 255, g: 255, b: 255 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      const isLight = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const color = isLight ? white : lightGray;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 255;
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

// Apple Icon Composer preset background names
export type ApplePresetName =
  | 'sine-purple-orange'
  | 'sine-gasflame'
  | 'sine-magenta'
  | 'sine-green-yellow'
  | 'sine-purple-orange-black'
  | 'sine-gray';

// Map preset names to filenames
const APPLE_PRESET_FILES: Record<ApplePresetName, string> = {
  'sine-purple-orange': '1 - sine-purple-orange.jpeg',
  'sine-gasflame': '2 - sine-gasflame.jpeg',
  'sine-magenta': '3 - sine-magenta.jpeg',
  'sine-green-yellow': '4 - sine-green-yellow.jpeg',
  'sine-purple-orange-black': '5 - sine-purple-orange-black.jpeg',
  'sine-gray': '6 - sine-gray.jpeg',
};

// Search paths for Apple preset backgrounds (from Icon Composer.app, not bundled)
const BACKGROUNDS_SEARCH_PATHS = [
  '/Applications/Icon Composer.app/Contents/Frameworks/IconComposerKit.framework/Versions/A/Resources/Backgrounds',
  '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Frameworks/IconComposerKit.framework/Versions/A/Resources/Backgrounds',
  '/Applications/Xcode-beta.app/Contents/Applications/Icon Composer.app/Contents/Frameworks/IconComposerKit.framework/Versions/A/Resources/Backgrounds',
];

function getBackgroundsDir(): string | null {
  for (const p of BACKGROUNDS_SEARCH_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

// Canvas background presets
export type CanvasBackground =
  | { type: 'none' }
  | { type: 'solid'; color: string } // hex color
  | { type: 'checkerboard'; cellSize?: number }
  | { type: 'image'; path: string }
  | { type: 'preset'; name: 'light' | 'dark' | 'checkerboard' | 'homescreen-light' | 'homescreen-dark' }
  | { type: 'apple-preset'; name: ApplePresetName };

// Resolve a canvas background to a sharp image buffer at the given size
export async function resolveCanvasBackground(bg: CanvasBackground, size: number): Promise<Buffer | null> {
  switch (bg.type) {
    case 'none':
      return null;

    case 'solid': {
      const hex = bg.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return sharp({
        create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 255 } },
      })
        .png()
        .toBuffer();
    }

    case 'checkerboard':
      return generateCheckerboard(size, bg.cellSize ?? 32);

    case 'image': {
      const imgBuf = await fs.readFile(bg.path);
      return sharp(imgBuf).resize(size, size, { fit: 'cover' }).png().toBuffer();
    }

    case 'apple-preset': {
      const bgDir = getBackgroundsDir();
      if (!bgDir)
        throw new Error(
          'Apple preset backgrounds require Icon Composer.app. Install: brew install --cask icon-composer',
        );
      const filename = APPLE_PRESET_FILES[bg.name];
      const bgPath = path.join(bgDir, filename);
      const imgBuf = await fs.readFile(bgPath);
      return sharp(imgBuf).resize(size, size, { fit: 'cover' }).png().toBuffer();
    }

    case 'preset': {
      switch (bg.name) {
        case 'light':
          return sharp({
            create: { width: size, height: size, channels: 4, background: { r: 242, g: 242, b: 247, alpha: 255 } },
          })
            .png()
            .toBuffer();
        case 'dark':
          return sharp({
            create: { width: size, height: size, channels: 4, background: { r: 28, g: 28, b: 30, alpha: 255 } },
          })
            .png()
            .toBuffer();
        case 'checkerboard':
          return generateCheckerboard(size, 32);
        case 'homescreen-light': {
          // iOS-style light gradient wallpaper
          const channels = 4;
          const data = Buffer.alloc(size * size * channels);
          for (let y = 0; y < size; y++) {
            const t = y / size;
            const r = Math.round(200 + t * 40);
            const g = Math.round(210 + t * 30);
            const b = Math.round(235 + t * 15);
            for (let x = 0; x < size; x++) {
              const idx = (y * size + x) * channels;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = 255;
            }
          }
          return sharp(data, { raw: { width: size, height: size, channels } })
            .png()
            .toBuffer();
        }
        case 'homescreen-dark': {
          // iOS-style dark gradient wallpaper
          const channels = 4;
          const data = Buffer.alloc(size * size * channels);
          for (let y = 0; y < size; y++) {
            const t = y / size;
            const r = Math.round(15 + t * 15);
            const g = Math.round(15 + t * 10);
            const b = Math.round(25 + t * 20);
            for (let x = 0; x < size; x++) {
              const idx = (y * size + x) * channels;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = 255;
            }
          }
          return sharp(data, { raw: { width: size, height: size, channels } })
            .png()
            .toBuffer();
        }
        default:
          return null;
      }
    }
  }
}

// Composite an icon image on top of a canvas background
// For apple presets, preserves the native ratio between icon and background
export async function compositeOnBackground(
  iconBuffer: Buffer,
  canvasBg: CanvasBackground,
  canvasSize: number,
  iconSize?: number,
): Promise<Buffer> {
  // For apple presets, handle separately to avoid decoding the 8192 JPEG twice.
  if (canvasBg.type === 'apple-preset') {
    // The icon stays at its native rendered size (e.g. 1024px)
    // and the canvas grows around it to preserve the correct icon-to-background ratio.
    // Zoom only affects how much background is visible, not icon resolution.
    // The background is 8192x8192 and the icon is ~1024px within that.
    // This native ratio must NEVER change — the icon-to-pattern scale is fixed.
    //
    // Step 1: Composite icon onto bg at native ratio (icon = bg / 8)
    // Step 2: Crop the center to show desired zoom level
    // Step 3: Output is always sized so the icon is at its native pixel size
    //
    // zoom=1.0 (default) → visible icon is ~50% of output
    // zoom=0.5 → zoomed out, visible icon is ~25%
    // zoom<0.25 → full background visible

    // Match the non-preset behavior: icon is (zoom * 100%) of the output canvas.
    // Crop center of the 8192 bg to show a zoomed-in portion, then resize to canvas.
    const bgDir = getBackgroundsDir();
    if (!bgDir)
      throw new Error('Apple preset backgrounds require Icon Composer.app. Install: brew install --cask icon-composer');
    const bgPath = path.join(bgDir, APPLE_PRESET_FILES[canvasBg.name]);
    const bgRaw = await fs.readFile(bgPath);
    const bgMeta = await sharp(bgRaw).metadata();
    const bgNative = bgMeta.width ?? 8192;
    // Crop center ~25% of the wallpaper so the pattern looks natural at icon scale
    const cropRegion = Math.round(bgNative * 0.2);
    const cropOffset = Math.round((bgNative - cropRegion) / 2);
    const bgResized = await sharp(bgRaw)
      .extract({ left: cropOffset, top: cropOffset, width: cropRegion, height: cropRegion })
      .resize(canvasSize, canvasSize)
      .ensureAlpha()
      .png()
      .toBuffer();

    const actualIconSize = iconSize ?? canvasSize;
    const iconResized = await sharp(iconBuffer)
      .resize(actualIconSize, actualIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const offset = Math.round((canvasSize - actualIconSize) / 2);

    return sharp(bgResized)
      .composite([{ input: iconResized, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  const bgBuffer = await resolveCanvasBackground(canvasBg, canvasSize);
  const actualIconSize = iconSize ?? canvasSize;

  // Resize icon if needed
  let iconResized = iconBuffer;
  if (actualIconSize !== canvasSize) {
    iconResized = await sharp(iconBuffer)
      .resize(actualIconSize, actualIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  let offset = Math.round((canvasSize - actualIconSize) / 2);

  // When zoomed > 1.0, the icon is larger than the canvas. Crop the center
  // of the icon to canvas size so sharp can composite it.
  if (actualIconSize > canvasSize) {
    const cropOffset = Math.round((actualIconSize - canvasSize) / 2);
    iconResized = await sharp(iconResized)
      .extract({ left: cropOffset, top: cropOffset, width: canvasSize, height: canvasSize })
      .png()
      .toBuffer();
    offset = 0;
  }

  if (bgBuffer) {
    return sharp(bgBuffer)
      .composite([{ input: iconResized, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  // No background — just return the icon (possibly resized onto transparent canvas)
  if (offset !== 0) {
    return sharp({
      create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: iconResized, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  return iconResized;
}

// Generate a flat preview PNG by compositing layers
export async function renderPreview(
  manifest: IconManifest,
  assets: Map<string, Buffer>,
  size: number = 1024,
  appearance?: 'dark' | 'tinted',
): Promise<Buffer> {
  const background = await resolveFlatBackground(manifest, assets, size, appearance);
  const overlays: sharp.OverlayOptions[] = [];
  if ('image' in background) overlays.push({ input: background.image, left: 0, top: 0 });
  overlays.push(...(await buildLayerOverlays(manifest, assets, size, appearance)));

  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: 'color' in background ? background.color : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png();

  return (overlays.length > 0 ? canvas.composite(overlays) : canvas).toBuffer();
}
