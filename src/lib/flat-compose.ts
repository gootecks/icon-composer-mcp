import sharp from 'sharp';
import type { FillValue, Group, IconManifest, Layer, Position, Specialization } from '../types';

type Appearance = 'dark' | 'tinted' | undefined;
type Rgba = { r: number; g: number; b: number; alpha: number };

const CANVAS_POINTS = 1024;
const AUTOMATIC_GRADIENT_TOP_LIGHTEN = 1.13;
const SYSTEM_DARK: [string, string] = ['srgb:0.13333,0.13333,0.12941,1', 'srgb:0.06667,0.06275,0.07059,1'];
const SYSTEM_LIGHT: [string, string] = ['srgb:1,1,1,1', 'srgb:0.96500,0.96500,0.96800,1'];

export function parseColorString(cs: string): Rgba {
  const fallback = { r: 255, g: 255, b: 255, alpha: 1 };
  const parts = cs.split(':')[1]?.split(',').map(Number);
  if (!parts || parts.some(isNaN)) return fallback;
  if (parts.length === 2) {
    const v = Math.round(parts[0] * 255);
    return { r: v, g: v, b: v, alpha: parts[1] };
  }
  if (parts.length < 4) return fallback;
  return {
    r: Math.round(parts[0] * 255),
    g: Math.round(parts[1] * 255),
    b: Math.round(parts[2] * 255),
    alpha: parts[3],
  };
}

export function resolveSpec<T>(
  base: T | undefined,
  specs: Specialization<T>[] | undefined,
  appearance: Appearance,
): T | undefined {
  if (appearance !== undefined) {
    const match = specs?.find(s => s.appearance === appearance && s.idiom === undefined);
    if (match) return match.value;
  }
  if (base !== undefined) return base;
  return specs?.find(s => s.appearance === undefined && s.idiom === undefined)?.value;
}

function gradientSvg(size: number, top: Rgba, bottom: Rgba, x1 = 0.5, y1 = 0, x2 = 0.5, y2 = 1): Buffer {
  const stop = (c: Rgba, offset: number) =>
    `<stop offset="${offset}%" stop-color="rgb(${c.r},${c.g},${c.b})" stop-opacity="${c.alpha}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      ${stop(top, 0)}
      ${stop(bottom, 100)}
    </linearGradient></defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
  </svg>`);
}

function lighten(c: Rgba, factor: number): Rgba {
  const f = (v: number) => Math.min(255, Math.round(v * factor));
  return { r: f(c.r), g: f(c.g), b: f(c.b), alpha: c.alpha };
}

async function automaticColor(manifest: IconManifest, assets: Map<string, Buffer>): Promise<Rgba> {
  const firstAsset = manifest.groups[0]?.layers[0]?.['image-name'];
  const buf = firstAsset ? assets.get(firstAsset) : undefined;
  if (!buf) return { r: 255, g: 255, b: 255, alpha: 1 };
  const { dominant } = await sharp(buf).stats();
  return { r: dominant.r, g: dominant.g, b: dominant.b, alpha: 1 };
}

export type FlatBackground = { color: Rgba } | { image: Buffer };

export async function resolveFlatBackground(
  manifest: IconManifest,
  assets: Map<string, Buffer>,
  size: number,
  appearance: Appearance,
): Promise<FlatBackground> {
  const fill = resolveSpec(manifest.fill, manifest['fill-specializations'], appearance) as FillValue | undefined;
  const white = { color: { r: 255, g: 255, b: 255, alpha: 1 } };
  if (fill === undefined) return white;
  if (fill === 'none') return { color: { r: 0, g: 0, b: 0, alpha: 0 } };
  if (fill === 'automatic') return { color: await automaticColor(manifest, assets) };
  if (fill === 'system-dark' || fill === 'system-light') {
    const [top, bottom] = (fill === 'system-dark' ? SYSTEM_DARK : SYSTEM_LIGHT).map(parseColorString);
    return { image: await sharp(gradientSvg(size, top, bottom)).png().toBuffer() };
  }
  if (typeof fill === 'string') return { color: parseColorString(fill) };
  if ('solid' in fill) return { color: parseColorString(fill.solid) };
  if ('automatic-gradient' in fill) {
    const base = parseColorString(fill['automatic-gradient']);
    return { image: await sharp(gradientSvg(size, lighten(base, AUTOMATIC_GRADIENT_TOP_LIGHTEN), base)).png().toBuffer() };
  }
  if ('linear-gradient' in fill) {
    const [a, b] = fill['linear-gradient'].map(parseColorString);
    const { start, stop } = fill.orientation;
    // Apple's gradient coordinates have the y axis pointing up
    const svg = gradientSvg(size, a, b, start.x, 1 - start.y, stop.x, 1 - stop.y);
    return { image: await sharp(svg).png().toBuffer() };
  }
  return white;
}

interface PlacedLayer {
  layer: Layer;
  opacity: number;
  scale: number;
  offset: [number, number];
}

function groupPlacement(group: Group, appearance: Appearance): Position {
  return resolveSpec(group.position, group['position-specializations'], appearance)
    ?? { scale: 1, 'translation-in-points': [0, 0] };
}

// icon.json lists the top group and the top layer first, so painting runs in reverse
export function collectVisibleLayers(manifest: IconManifest, appearance: Appearance): PlacedLayer[] {
  const placed: PlacedLayer[] = [];
  for (const group of [...manifest.groups].reverse()) {
    if (resolveSpec(group.hidden, group['hidden-specializations'], appearance)) continue;
    const groupOpacity = resolveSpec(group.opacity, group['opacity-specializations'], appearance) ?? 1;
    const gp = groupPlacement(group, appearance);

    for (const layer of [...group.layers].reverse()) {
      if (resolveSpec(layer.hidden, layer['hidden-specializations'], appearance)) continue;
      const opacity = (resolveSpec(layer.opacity, layer['opacity-specializations'], appearance) ?? 1) * groupOpacity;
      const lp = resolveSpec(layer.position, layer['position-specializations'], appearance);
      const lScale = lp?.scale ?? 1;
      const [lx, ly] = lp?.['translation-in-points'] ?? [0, 0];
      const [gx, gy] = gp['translation-in-points'];
      placed.push({
        layer,
        opacity,
        scale: lScale * gp.scale,
        offset: [gx + lx * gp.scale, gy + ly * gp.scale],
      });
    }
  }
  return placed;
}

async function rasterizeLayer(asset: Buffer, layerPx: number, opacity: number): Promise<Buffer> {
  const meta = await sharp(asset).metadata();
  const longest = Math.max(meta.width ?? 1, meta.height ?? 1);
  const input = meta.format === 'svg'
    ? sharp(asset, { density: Math.min(100000, Math.max(1, (72 * layerPx) / longest)) })
    : sharp(asset);
  const resized = input
    .resize(layerPx, layerPx, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha();
  if (opacity >= 1) return resized.png().toBuffer();
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * opacity);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export async function buildLayerOverlays(
  manifest: IconManifest,
  assets: Map<string, Buffer>,
  size: number,
  appearance: Appearance,
): Promise<sharp.OverlayOptions[]> {
  const overlays: sharp.OverlayOptions[] = [];
  const pxPerPoint = size / CANVAS_POINTS;

  for (const { layer, opacity, scale, offset } of collectVisibleLayers(manifest, appearance)) {
    const asset = assets.get(layer['image-name']);
    if (!asset || opacity <= 0) continue;

    const layerPx = Math.max(1, Math.round(size * scale));
    let buf = await rasterizeLayer(asset, layerPx, opacity);
    let left = Math.round((size - layerPx) / 2 + offset[0] * pxPerPoint);
    let top = Math.round((size - layerPx) / 2 + offset[1] * pxPerPoint);

    const cropLeft = Math.max(0, -left);
    const cropTop = Math.max(0, -top);
    const cropWidth = Math.min(layerPx - cropLeft, size - Math.max(left, 0));
    const cropHeight = Math.min(layerPx - cropTop, size - Math.max(top, 0));
    if (cropWidth <= 0 || cropHeight <= 0) continue;
    if (cropLeft > 0 || cropTop > 0 || cropWidth < layerPx || cropHeight < layerPx) {
      buf = await sharp(buf)
        .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();
      left = Math.max(0, left);
      top = Math.max(0, top);
    }
    overlays.push({ input: buf, left, top });
  }
  return overlays;
}
