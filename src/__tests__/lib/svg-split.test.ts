import { test, expect, describe } from 'bun:test';
import { splitSvgLayers } from '../../lib/svg-split';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('splitSvgLayers size', () => {
  test('derives width/height from viewBox when root has no size', () => {
    const svg = `<svg ${NS} viewBox="0 0 1024 1024"><path d="M0 0h10v10z"/><path d="M5 5h10v10z"/></svg>`;
    const layers = splitSvgLayers(svg);
    expect(layers).toHaveLength(2);
    for (const l of layers) {
      expect(l.svg).toContain('viewBox="0 0 1024 1024"');
      expect(l.svg).toContain('width="1024"');
      expect(l.svg).toContain('height="1024"');
    }
  });

  test('keeps explicit root width/height', () => {
    const svg = `<svg ${NS} width="512" height="256" viewBox="0 0 1024 1024"><path d="M0 0h10v10z"/></svg>`;
    const [layer] = splitSvgLayers(svg);
    expect(layer.svg).toContain('width="512"');
    expect(layer.svg).toContain('height="256"');
    expect(layer.svg).toContain('viewBox="0 0 1024 1024"');
  });

  test('ignores child width/height and stroke-width', () => {
    const svg = `<svg ${NS} viewBox="0 0 1024 1024"><rect width="10" height="10" stroke-width="3"/></svg>`;
    const [layer] = splitSvgLayers(svg);
    expect(layer.svg).toMatch(/<svg [^>]*width="1024" height="1024">/);
    expect(layer.svg).not.toMatch(/<svg [^>]*width="(10|3)"/);
  });

  test('ignores stroke-width on the root tag', () => {
    const svg = `<svg ${NS} stroke-width="3" viewBox="0 0 800 600"><path d="M0 0h10v10z"/></svg>`;
    const [layer] = splitSvgLayers(svg);
    expect(layer.svg).toContain('width="800" height="600"');
  });

  test('falls back to 400 with neither size nor viewBox', () => {
    const svg = `<svg ${NS}><path d="M0 0h10v10z"/></svg>`;
    const [layer] = splitSvgLayers(svg);
    expect(layer.svg).toContain('viewBox="0 0 400 400" width="400" height="400"');
  });
});
