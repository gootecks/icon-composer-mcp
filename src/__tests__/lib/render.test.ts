import { test, expect, describe } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  generateCheckerboard,
  resolveCanvasBackground,
  compositeOnBackground,
  renderPreview,
} from '../../lib/render';
import { resolveFill } from '../../lib/manifest';
import { TEST_PNG } from '../helpers/fixtures';
import { makeTempDir, cleanTempDir, createFixtureBundle, readManifest } from '../helpers/test-helpers';
import { setFill } from '../../lib/ops-glass';
import type { IconManifest } from '../../types';

// Helper to decode PNG pixels
async function getPixels(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixelAt(data: Buffer, x: number, y: number, width: number): [number, number, number, number] {
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

// --- generateCheckerboard ---

describe('generateCheckerboard', () => {
  test('produces a 64x64 PNG', async () => {
    const buf = await generateCheckerboard(64, 16);
    const { width, height } = await sharp(buf).metadata();
    expect(width).toBe(64);
    expect(height).toBe(64);
  });

  test('pixel at (0,0) is white', async () => {
    const buf = await generateCheckerboard(64, 16);
    const { data, width } = await getPixels(buf);
    expect(pixelAt(data, 0, 0, width)).toEqual([255, 255, 255, 255]);
  });

  test('pixel at (16,0) is light gray', async () => {
    const buf = await generateCheckerboard(64, 16);
    const { data, width } = await getPixels(buf);
    expect(pixelAt(data, 16, 0, width)).toEqual([204, 204, 204, 255]);
  });

  test('default cellSize=32: pixel at (32,0) is gray', async () => {
    const buf = await generateCheckerboard(64);
    const { data, width } = await getPixels(buf);
    expect(pixelAt(data, 32, 0, width)).toEqual([204, 204, 204, 255]);
  });
});

// --- resolveCanvasBackground ---

describe('resolveCanvasBackground', () => {
  test('type:none returns null', async () => {
    const result = await resolveCanvasBackground({ type: 'none' }, 64);
    expect(result).toBeNull();
  });

  test('type:solid #FF0000 → top-left pixel is red', async () => {
    const buf = await resolveCanvasBackground({ type: 'solid', color: '#FF0000' }, 4);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    expect(pixelAt(data, 0, 0, width)).toEqual([255, 0, 0, 255]);
  });

  test('type:checkerboard cellSize:8 → white then gray at correct intervals', async () => {
    const buf = await resolveCanvasBackground({ type: 'checkerboard', cellSize: 8 }, 16);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    // (0,0) should be white (cell 0,0 — even sum)
    expect(pixelAt(data, 0, 0, width)).toEqual([255, 255, 255, 255]);
    // (8,0) should be gray (cell 1,0 — odd sum)
    expect(pixelAt(data, 8, 0, width)).toEqual([204, 204, 204, 255]);
  });

  test('type:preset light → top-left pixel is [242,242,247,255]', async () => {
    const buf = await resolveCanvasBackground({ type: 'preset', name: 'light' }, 4);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    expect(pixelAt(data, 0, 0, width)).toEqual([242, 242, 247, 255]);
  });

  test('type:preset dark → top-left pixel is [28,28,30,255]', async () => {
    const buf = await resolveCanvasBackground({ type: 'preset', name: 'dark' }, 4);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    expect(pixelAt(data, 0, 0, width)).toEqual([28, 28, 30, 255]);
  });

  test('type:image with nonexistent path rejects', async () => {
    await expect(
      resolveCanvasBackground({ type: 'image', path: '/nonexistent/file.png' }, 64)
    ).rejects.toThrow();
  });

  // Apple preset tests — only run if the background files exist
  const backgroundsDir = path.join(import.meta.dir, '..', '..', '..', 'backgrounds');
  const lightFile = path.join(backgroundsDir, '1 - sine-purple-orange.jpeg');
  const applePresetsExist = fs.existsSync(lightFile);

  if (applePresetsExist) {
    test('type:apple-preset sine-purple-orange returns a buffer', async () => {
      const buf = await resolveCanvasBackground({ type: 'apple-preset', name: 'sine-purple-orange' }, 4);
      expect(buf).not.toBeNull();
      expect(buf!.length).toBeGreaterThan(0);
    });
  }
});

// --- compositeOnBackground ---

describe('compositeOnBackground', () => {
  test('type:none returns a Buffer', async () => {
    const result = await compositeOnBackground(TEST_PNG, { type: 'none' }, 4);
    expect(result).toBeInstanceOf(Buffer);
  });
});

// --- renderPreview ---

describe('renderPreview', () => {
  test('manifest with red solid fill → background pixels are red', async () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,0,0,1' },
    };
    const buf = await renderPreview(manifest, new Map(), 4);
    expect(buf).toBeInstanceOf(Buffer);
    const { data, width } = await getPixels(buf);
    const [r, g, b] = pixelAt(data, 0, 0, width);
    // Allow slight variation from compositing
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(50);
    expect(b).toBeLessThan(50);
  });

  test('manifest with dark fill specialization returns different buffer from default', async () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,1,1,1' },
      'fill-specializations': [
        { appearance: 'dark', value: { solid: 'srgb:0,0,0,1' } },
      ],
    };
    const assets = new Map<string, Buffer>();
    const defaultBuf = await renderPreview(manifest, assets, 4);
    const darkBuf = await renderPreview(manifest, assets, 4, 'dark');
    // Buffers should differ because fills differ
    expect(defaultBuf.equals(darkBuf)).toBe(false);
  });

  test('empty manifest returns buffer without throwing', async () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
    };
    const buf = await renderPreview(manifest, new Map(), 4);
    expect(buf).toBeInstanceOf(Buffer);
  });

  describe('flat compositing', () => {
    const SIZE = 64;
    const solidPng = (r: number, g: number, b: number) =>
      sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
    const layer = (name: string, extra: object = {}) => ({ 'image-name': name, name, ...extra });

    test('first group and first layer paint on top', async () => {
      const assets = new Map([
        ['red.png', await solidPng(255, 0, 0)],
        ['green.png', await solidPng(0, 255, 0)],
        ['blue.png', await solidPng(0, 0, 255)],
      ]);
      const manifest: IconManifest = {
        groups: [
          { layers: [layer('red.png'), layer('green.png')] },
          { layers: [layer('blue.png')] },
        ],
        'supported-platforms': {},
      };
      const { data, width } = await getPixels(await renderPreview(manifest, assets, SIZE));
      expect(pixelAt(data, 32, 32, width)).toEqual([255, 0, 0, 255]);

      manifest.groups[0].layers.shift();
      const next = await getPixels(await renderPreview(manifest, assets, SIZE));
      expect(pixelAt(next.data, 32, 32, next.width)).toEqual([0, 255, 0, 255]);
    });

    test('linear gradient from fill-specializations is drawn with y axis pointing up', async () => {
      const manifest: IconManifest = {
        groups: [],
        'supported-platforms': {},
        'fill-specializations': [
          {
            value: {
              'linear-gradient': ['srgb:1,1,1,1', 'srgb:0,0,0,1'],
              orientation: { start: { x: 0.5, y: 1 }, stop: { x: 0.5, y: 0 } },
            },
          },
        ],
      };
      const { data, width } = await getPixels(await renderPreview(manifest, new Map(), SIZE));
      const top = pixelAt(data, 32, 1, width);
      const bottom = pixelAt(data, 32, SIZE - 2, width);
      expect(top[0]).toBeGreaterThan(230);
      expect(bottom[0]).toBeLessThan(25);
    });

    describe('setFill gradient orientation (first color at top for angle 0)', () => {
      const render = async (angle: number) => {
        const dir = await makeTempDir('render-gradient-');
        try {
          const bundle = await createFixtureBundle(dir, 'grad');
          await setFill({ bundle_path: bundle, fill_type: 'gradient', color: '#FF0000', color2: '#0000FF', gradient_angle: angle });
          const manifest = await readManifest(bundle);
          manifest.groups = [];
          return getPixels(await renderPreview(manifest, new Map(), SIZE));
        } finally {
          await cleanTempDir(dir);
        }
      };

      test('angle 0: color at top, color2 at bottom', async () => {
        const { data, width } = await render(0);
        const top = pixelAt(data, 32, 1, width);
        const bottom = pixelAt(data, 32, SIZE - 2, width);
        expect(top[0]).toBeGreaterThan(top[2]);
        expect(bottom[2]).toBeGreaterThan(bottom[0]);
      });

      test('angle 90: color at left, color2 at right', async () => {
        const { data, width } = await render(90);
        const left = pixelAt(data, 1, 32, width);
        const right = pixelAt(data, SIZE - 2, 32, width);
        expect(left[0]).toBeGreaterThan(left[2]);
        expect(right[2]).toBeGreaterThan(right[0]);
      });

      test('angle 45: color at top-left, color2 at bottom-right', async () => {
        const { data, width } = await render(45);
        const topLeft = pixelAt(data, 1, 1, width);
        const bottomRight = pixelAt(data, SIZE - 2, SIZE - 2, width);
        expect(topLeft[0]).toBeGreaterThan(topLeft[2]);
        expect(bottomRight[2]).toBeGreaterThan(bottomRight[0]);
      });
    });

    test('top-level fill takes precedence over the default fill specialization', async () => {
      const manifest: IconManifest = {
        groups: [],
        'supported-platforms': {},
        fill: { solid: 'srgb:1,0,0,1' },
        'fill-specializations': [{ value: { solid: 'srgb:0,0,1,1' } }],
      };
      const { data, width } = await getPixels(await renderPreview(manifest, new Map(), SIZE));
      expect(pixelAt(data, 5, 5, width)).toEqual([255, 0, 0, 255]);
    });

    test('layer with 1024 viewBox at scale 1 covers the whole tile', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#ff0000"/></svg>');
      const assets = new Map([['full.svg', svg]]);
      const position = (scale: number) => ({ scale, 'translation-in-points': [0, 0] as [number, number] });
      const manifest: IconManifest = {
        groups: [{ layers: [layer('full.svg', { position: position(1) })] }],
        'supported-platforms': {},
        fill: { solid: 'srgb:0,0,1,1' },
      };
      const full = await getPixels(await renderPreview(manifest, assets, SIZE));
      expect(pixelAt(full.data, 1, 1, full.width)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(full.data, SIZE - 2, SIZE - 2, full.width)).toEqual([255, 0, 0, 255]);

      manifest.groups[0].layers[0].position = position(0.5);
      const half = await getPixels(await renderPreview(manifest, assets, SIZE));
      expect(pixelAt(half.data, 1, 1, half.width)).toEqual([0, 0, 255, 255]);
      expect(pixelAt(half.data, 32, 32, half.width)).toEqual([255, 0, 0, 255]);
    });

    test('hidden layers and hidden-specializations are skipped', async () => {
      const assets = new Map([['red.png', await solidPng(255, 0, 0)]]);
      const manifest: IconManifest = {
        groups: [{ layers: [layer('red.png', { 'hidden-specializations': [{ appearance: 'dark', value: true }] })] }],
        'supported-platforms': {},
        fill: { solid: 'srgb:0,0,1,1' },
      };
      const light = await getPixels(await renderPreview(manifest, assets, SIZE));
      expect(pixelAt(light.data, 32, 32, light.width)).toEqual([255, 0, 0, 255]);
      const dark = await getPixels(await renderPreview(manifest, assets, SIZE, 'dark'));
      expect(pixelAt(dark.data, 32, 32, dark.width)).toEqual([0, 0, 255, 255]);
    });
  });
});

// --- resolveFill ---

describe('resolveFill', () => {
  test('returns manifest.fill when no specializations', () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,0,0,1' },
    };
    expect(resolveFill(manifest)).toEqual({ solid: 'srgb:1,0,0,1' });
  });

  test('returns appearance-specific fill when it matches', () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,1,1,1' },
      'fill-specializations': [
        { appearance: 'dark', value: { solid: 'srgb:0,0,0,1' } },
      ],
    };
    expect(resolveFill(manifest, 'dark')).toEqual({ solid: 'srgb:0,0,0,1' });
  });

  test('falls back to manifest.fill when no matching specialization', () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,1,1,1' },
      'fill-specializations': [
        { appearance: 'dark', value: { solid: 'srgb:0,0,0,1' } },
      ],
    };
    expect(resolveFill(manifest, 'tinted')).toEqual({ solid: 'srgb:1,1,1,1' });
  });
});
