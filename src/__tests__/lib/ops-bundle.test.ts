import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  makeTempDir,
  cleanTempDir,
  writeTempPng,
  writeTempSvg,
  readManifest,
  listAssets,
  assetExists,
  createFixtureBundle,
  responseText,
  isErrorResult,
} from '../helpers/test-helpers';
import { createIcon, addLayerToBundle, removeFromBundle, moveLayer, inspectBundle } from '../../lib/ops-bundle';
import type { CreateIconParams, AddLayerParams } from '../../lib/ops-bundle';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await makeTempDir('ops-bundle-');
});

afterEach(async () => {
  await cleanTempDir(tmpDir);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCreateParams(overrides: Partial<CreateIconParams> = {}): CreateIconParams {
  return {
    foreground_path: '', // must be set per test
    output_dir: tmpDir,
    bundle_name: 'TestIcon',
    bg_color: '#0A66C2',
    glyph_scale: 1.75,
    specular: true,
    shadow_kind: 'layer-color',
    shadow_opacity: 0.5,
    translucency_enabled: false,
    translucency_value: 0.4,
    ...overrides,
  };
}

function defaultAddLayerParams(overrides: Partial<AddLayerParams> = {}): AddLayerParams {
  return {
    bundle_path: '',
    image_path: '',
    layer_name: 'overlay',
    group_index: 0,
    create_group: false,
    opacity: 1.0,
    scale: 1.0,
    offset_x: 0,
    offset_y: 0,
    blend_mode: 'normal',
    glass: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createIcon
// ---------------------------------------------------------------------------

describe('createIcon', () => {
  test('minimal params — creates bundle with manifest and asset', async () => {
    const pngPath = await writeTempPng(tmpDir);
    const result = await createIcon(defaultCreateParams({ foreground_path: pngPath }));

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Created .icon bundle at:');

    const bundlePath = path.join(tmpDir, 'TestIcon.icon');
    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].name).toBe('Foreground');
    expect(manifest.groups[0].layers).toHaveLength(1);
    expect(manifest.groups[0].layers[0]['image-name']).toBe('foreground.png');
    expect(manifest.groups[0].layers[0].name).toBe('glyph');

    const assets = await listAssets(bundlePath);
    expect(assets).toContain('foreground.png');
  });

  test('dark mode — creates fill specializations', async () => {
    const pngPath = await writeTempPng(tmpDir);
    const result = await createIcon(
      defaultCreateParams({
        foreground_path: pngPath,
        dark_bg_color: '#1A1A2E',
      }),
    );

    expect(isErrorResult(result)).toBe(false);

    const bundlePath = path.join(tmpDir, 'TestIcon.icon');
    const manifest = await readManifest(bundlePath);
    expect(manifest['fill-specializations']).toBeDefined();
    expect(manifest['fill-specializations']!.length).toBe(2);
    expect(manifest['fill-specializations']![1].appearance).toBe('dark');
  });

  test('SVG input — uses .svg extension for asset', async () => {
    const svgPath = await writeTempSvg(tmpDir);
    const result = await createIcon(defaultCreateParams({ foreground_path: svgPath }));

    expect(isErrorResult(result)).toBe(false);

    const bundlePath = path.join(tmpDir, 'TestIcon.icon');
    const manifest = await readManifest(bundlePath);
    expect(manifest.groups[0].layers[0]['image-name']).toBe('foreground.svg');

    const assets = await listAssets(bundlePath);
    expect(assets).toContain('foreground.svg');
  });

  test('missing file — returns error result', async () => {
    const result = await createIcon(
      defaultCreateParams({
        foreground_path: path.join(tmpDir, 'nonexistent.png'),
      }),
    );

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('Error:');
  });
});

// ---------------------------------------------------------------------------
// addLayerToBundle
// ---------------------------------------------------------------------------

describe('addLayerToBundle', () => {
  test('add to existing group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'AddTest');
    const pngPath = await writeTempPng(tmpDir, 'overlay.png');

    const result = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: pngPath,
        layer_name: 'overlay',
        group_index: 0,
      }),
    );

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Added layer "overlay"');

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups[0].layers).toHaveLength(2);
    expect(manifest.groups[0].layers[1].name).toBe('overlay');

    expect(await assetExists(bundlePath, 'overlay.png')).toBe(true);
  });

  test('create new group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'NewGroup');
    const pngPath = await writeTempPng(tmpDir, 'bg.png');

    const result = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: pngPath,
        layer_name: 'background',
        create_group: true,
      }),
    );

    expect(isErrorResult(result)).toBe(false);

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(2);
    expect(manifest.groups[1].name).toBe('background');
    expect(manifest.groups[1].layers[0].name).toBe('background');
  });

  test('path traversal in layer_name — sanitized to safe filename', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'Traversal');
    const pngPath = await writeTempPng(tmpDir, 'evil.png');

    const result = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: pngPath,
        layer_name: '../../etc/passwd',
        group_index: 0,
      }),
    );

    expect(isErrorResult(result)).toBe(false);

    // Asset should be written as "passwd.png" inside Assets/, not escaped
    expect(await assetExists(bundlePath, 'passwd.png')).toBe(true);

    const manifest = await readManifest(bundlePath);
    const addedLayer = manifest.groups[0].layers[1];
    expect(addedLayer['image-name']).toBe('passwd.png');
    expect(addedLayer.name).toBe('passwd');
  });

  test('special characters in layer_name — replaced with underscore', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'SpecialChars');
    const pngPath = await writeTempPng(tmpDir, 'icon.png');

    const result = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: pngPath,
        layer_name: 'my icon@2x',
        group_index: 0,
      }),
    );

    expect(isErrorResult(result)).toBe(false);
    expect(await assetExists(bundlePath, 'my_icon_2x.png')).toBe(true);
  });

  test('valid image extensions (.png, .svg) — accepted', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'ExtPng');
    const pngPath = await writeTempPng(tmpDir, 'valid.png');

    const pngResult = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: pngPath,
        layer_name: 'valid-png',
      }),
    );
    expect(isErrorResult(pngResult)).toBe(false);

    const svgPath = await writeTempSvg(tmpDir, 'valid.svg');
    const svgResult = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: svgPath,
        layer_name: 'valid-svg',
      }),
    );
    expect(isErrorResult(svgResult)).toBe(false);
  });

  test('invalid image extension (.sh, .exe) — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'ExtBad');

    // Create files with disallowed extensions
    const shPath = path.join(tmpDir, 'evil.sh');
    await fs.writeFile(shPath, '#!/bin/bash\necho pwned');

    const shResult = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: shPath,
        layer_name: 'evil-sh',
      }),
    );
    expect(isErrorResult(shResult)).toBe(true);
    expect(responseText(shResult)).toContain('unsupported image extension');
    expect(responseText(shResult)).toContain('.sh');

    const exePath = path.join(tmpDir, 'evil.exe');
    await fs.writeFile(exePath, Buffer.from('MZ'));

    const exeResult = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: exePath,
        layer_name: 'evil-exe',
      }),
    );
    expect(isErrorResult(exeResult)).toBe(true);
    expect(responseText(exeResult)).toContain('unsupported image extension');
    expect(responseText(exeResult)).toContain('.exe');
  });

  test('empty bundle auto-creates group', async () => {
    // Create a bundle with zero groups
    const bundlePath = path.join(tmpDir, 'Empty.icon');
    await fs.mkdir(path.join(bundlePath, 'Assets'), { recursive: true });
    await fs.writeFile(
      path.join(bundlePath, 'icon.json'),
      JSON.stringify({ groups: [], 'supported-platforms': { squares: 'shared' } }, null, 2),
    );

    const pngPath = await writeTempPng(tmpDir, 'first.png');
    const result = await addLayerToBundle(
      defaultAddLayerParams({
        bundle_path: bundlePath,
        image_path: pngPath,
        layer_name: 'first',
      }),
    );

    expect(isErrorResult(result)).toBe(false);

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].name).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// removeFromBundle
// ---------------------------------------------------------------------------

describe('removeFromBundle', () => {
  test('remove layer', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'RemLayer', { layerCount: 2 });

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      layer_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Removed layer');

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups[0].layers).toHaveLength(1);
  });

  test('remove group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'RemGroup', { groupCount: 2 });

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Removed group');

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].name).toBe('Group1');
  });

  test('shared asset survival — asset kept when still referenced', async () => {
    // Create a bundle where two layers in different groups share the same image name
    const bundlePath = path.join(tmpDir, 'Shared.icon');
    await fs.mkdir(path.join(bundlePath, 'Assets'), { recursive: true });

    const sharedImage = 'shared.png';
    await fs.writeFile(path.join(bundlePath, 'Assets', sharedImage), Buffer.from('fake'));

    const manifest = {
      groups: [
        {
          name: 'G0',
          layers: [{ 'image-name': sharedImage, name: 'layer-a' }],
        },
        {
          name: 'G1',
          layers: [{ 'image-name': sharedImage, name: 'layer-b' }],
        },
      ],
      'supported-platforms': { squares: 'shared' as const },
    };
    await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

    // Remove group 0 — shared.png should survive because G1 still references it
    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(await assetExists(bundlePath, sharedImage)).toBe(true);
  });

  test('group index out of range — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'OOB');

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 99,
      cleanup_assets: false,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('out of range');
  });

  test('layer index out of range — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'LayerOOB');

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      layer_index: 99,
      cleanup_assets: false,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('out of range');
  });

  test('path traversal in image-name — does not delete files outside bundle', async () => {
    // Create a bundle with a crafted manifest containing a traversal image-name
    const bundlePath = path.join(tmpDir, 'Traversal.icon');
    await fs.mkdir(path.join(bundlePath, 'Assets'), { recursive: true });

    // Create a file outside the bundle that the traversal would target
    const outsideFile = path.join(tmpDir, 'important.txt');
    await fs.writeFile(outsideFile, 'do not delete me');

    const manifest = {
      groups: [
        {
          name: 'Evil',
          layers: [{ 'image-name': '../important.txt', name: 'evil-layer' }],
        },
      ],
      'supported-platforms': { squares: 'shared' as const },
    };
    await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);

    // The file outside the bundle must still exist
    const stat = await fs.stat(outsideFile).catch(() => null);
    expect(stat).not.toBeNull();
    const content = await fs.readFile(outsideFile, 'utf-8');
    expect(content).toBe('do not delete me');
  });

  test('target=layer without layer_index — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'NoIdx');

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      cleanup_assets: false,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('layer_index is required');
  });
});

// ---------------------------------------------------------------------------
// moveLayer
// ---------------------------------------------------------------------------

describe('moveLayer', () => {
  const layerNames = (m: { groups: { layers: { name: string }[] }[] }) =>
    m.groups.map((g) => g.layers.map((l) => l.name));

  test('move to existing group at top', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'MoveExisting', { groupCount: 2, layerCount: 2 });

    const result = await moveLayer({ bundle_path: bundlePath, group_index: 0, layer_index: 1, to_group_index: 1 });

    expect(isErrorResult(result)).toBe(false);
    const manifest = await readManifest(bundlePath);
    expect(layerNames(manifest)).toEqual([['layer-0-0'], ['layer-0-1', 'layer-1-0', 'layer-1-1']]);
  });

  test('move into new group inserted at index 0', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'MoveNew', { groupCount: 2, layerCount: 2 });
    const before = await readManifest(bundlePath);
    const original = structuredClone(before.groups[1].layers[1]);

    const result = await moveLayer({
      bundle_path: bundlePath,
      group_index: 1,
      layer_index: 1,
      create_group: true,
      group_name: 'Fresh',
    });

    expect(isErrorResult(result)).toBe(false);
    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(3);
    expect(manifest.groups[0].name).toBe('Fresh');
    expect(manifest.groups[0].layers).toEqual([original]);
    expect(manifest.groups[2].layers.map((l) => l.name)).toEqual(['layer-1-0']);
  });

  test('reorder inside one group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'MoveSame', { layerCount: 3 });

    const result = await moveLayer({
      bundle_path: bundlePath,
      group_index: 0,
      layer_index: 2,
      to_group_index: 0,
      to_layer_index: 0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(layerNames(await readManifest(bundlePath))).toEqual([['layer-0-2', 'layer-0-0', 'layer-0-1']]);

    await moveLayer({ bundle_path: bundlePath, group_index: 0, layer_index: 0, to_group_index: 0, to_layer_index: 99 });
    expect(layerNames(await readManifest(bundlePath))).toEqual([['layer-0-0', 'layer-0-1', 'layer-0-2']]);
  });

  test('emptied source group is removed and destination index refers to pre-move manifest', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'MoveEmpty', { groupCount: 3, layerCount: 1 });

    const result = await moveLayer({ bundle_path: bundlePath, group_index: 0, layer_index: 0, to_group_index: 2 });

    expect(isErrorResult(result)).toBe(false);
    const manifest = await readManifest(bundlePath);
    expect(manifest.groups.map((g) => g.name)).toEqual(['Group1', 'Group2']);
    expect(layerNames(manifest)).toEqual([['layer-1-0'], ['layer-0-0', 'layer-2-0']]);
  });

  test('out-of-range and missing destination — return errors', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'MoveErr', { groupCount: 2, layerCount: 1 });

    const badGroup = await moveLayer({ bundle_path: bundlePath, group_index: 5, layer_index: 0, to_group_index: 0 });
    expect(isErrorResult(badGroup)).toBe(true);
    expect(responseText(badGroup)).toContain('out of range');

    const badLayer = await moveLayer({ bundle_path: bundlePath, group_index: 0, layer_index: 3, to_group_index: 1 });
    expect(isErrorResult(badLayer)).toBe(true);
    expect(responseText(badLayer)).toContain('out of range');

    const badDest = await moveLayer({ bundle_path: bundlePath, group_index: 0, layer_index: 0, to_group_index: 2 });
    expect(isErrorResult(badDest)).toBe(true);
    expect(responseText(badDest)).toContain('out of range');

    const noDest = await moveLayer({ bundle_path: bundlePath, group_index: 0, layer_index: 0 });
    expect(isErrorResult(noDest)).toBe(true);
    expect(responseText(noDest)).toContain('to_group_index is required');

    expect(layerNames(await readManifest(bundlePath))).toEqual([['layer-0-0'], ['layer-1-0']]);
  });
});

// ---------------------------------------------------------------------------
// inspectBundle
// ---------------------------------------------------------------------------

describe('inspectBundle', () => {
  test('valid bundle — returns manifest and asset list', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'Inspect', { layerCount: 2 });

    const result = await inspectBundle({ bundle_path: bundlePath });

    expect(isErrorResult(result)).toBe(false);
    const text = responseText(result);
    expect(text).toContain('Manifest:');
    expect(text).toContain('Assets:');
    expect(text).toContain('g0_l0.png');
    expect(text).toContain('g0_l1.png');
    expect(text).toContain('KB');
  });

  test('empty bundle — returns (none) for assets', async () => {
    const bundlePath = path.join(tmpDir, 'Empty.icon');
    await fs.mkdir(bundlePath, { recursive: true });
    await fs.writeFile(
      path.join(bundlePath, 'icon.json'),
      JSON.stringify({ groups: [], 'supported-platforms': { squares: 'shared' } }, null, 2),
    );

    const result = await inspectBundle({ bundle_path: bundlePath });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('(none)');
  });
});
