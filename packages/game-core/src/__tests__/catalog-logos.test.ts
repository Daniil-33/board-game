import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Asset checks only: neither this manifest nor the images enter the rules engine.
const directory = fileURLToPath(new URL('../catalog/logos/', import.meta.url));
const catalog = JSON.parse(readFileSync(new URL('../catalog/ua-1.json', import.meta.url), 'utf8')) as {
  categories: { companies: { id: string }[] }[];
  logistics: { id: string }[];
  energy: { id: string }[];
};
type Entry = {
  file: string;
  darkFile: string;
  monogram: string;
  source: string;
  license: string;
};
const manifest = JSON.parse(readFileSync(join(directory, 'logos.json'), 'utf8')) as Record<string, Entry>;
const ids = [
  ...catalog.categories.flatMap(({ companies }) => companies),
  ...catalog.logistics,
  ...catalog.energy,
].map(({ id }) => id);

// Deliberately narrow SVG subset: geometry, gradients and local clipping only.
// No CSS, entities, animation, embedded images, foreign namespaces or active content.
function validateSvg(svg: string): void {
  expect(svg).toMatch(/^<svg\s/);
  expect(svg.trim()).toMatch(/<\/svg>$/);
  expect(svg).not.toMatch(/<\?|<!|&|\\/);
  const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'use']);
  const attributes = new Set(['xmlns', 'xmlns:xlink', 'role', 'aria-label', 'viewBox', 'width', 'height', 'id', 'd', 'fill',
    'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'clipPathUnits', 'mask', 'maskUnits',
    'maskContentUnits', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
    'transform', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points',
    'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
    'fx', 'fy', 'fr', 'preserveAspectRatio', 'href', 'xlink:href']);
  for (const tag of svg.matchAll(/<\/?([^\s/>]+)([^>]*?)\/?\s*>/g)) {
    expect(tags.has(tag[1]!), `SVG element ${tag[1]}`).toBe(true);
    let rest = tag[2]!;
    for (const attribute of rest.matchAll(/\s+([^\s=]+)\s*=\s*(["'])(.*?)\2/gs)) {
      const name = attribute[1]!;
      const value = attribute[3]!;
      expect(attributes.has(name), `SVG attribute ${name}`).toBe(true);
      if (name === 'xmlns') expect(value).toBe('http://www.w3.org/2000/svg');
      else if (name === 'xmlns:xlink') expect(value).toBe('http://www.w3.org/1999/xlink');
      else {
        expect(value).not.toMatch(/[:<>]/);
        if (name === 'href' || name === 'xlink:href') expect(value).toMatch(/^#[\w-]+$/);
        for (const url of value.matchAll(/url\s*\((.*?)\)/gi)) {
          expect(url[1]).toMatch(/^#[\w-]+$/);
        }
        expect(value.replace(/url\(#[\w-]+\)/g, '')).not.toMatch(/url/i);
      }
      rest = rest.replace(attribute[0], '');
    }
    expect(rest.trim(), 'unparsed SVG attributes').toBe('');
  }
}

describe('catalog logos (data only)', () => {
  it('covers exactly every catalog company, including logistics and energy', () => {
    expect(Object.keys(manifest).sort()).toEqual([...ids].sort());
  });

  it('has exactly the light and dark regular files plus metadata', () => {
    const files = Object.values(manifest).flatMap((entry) => [entry.file, entry.darkFile]);
    expect(new Set(files).size).toBe(files.length);
    expect(readdirSync(directory).sort()).toEqual(['.gitattributes', 'logos.json', 'README.md', 'FONT-LICENSE.txt', ...files].sort());
    for (const file of files) expect(lstatSync(join(directory, file)).isFile()).toBe(true);
  });

  it('ships the font license and final МГ mark', () => {
    expect(readFileSync(join(directory, 'FONT-LICENSE.txt'), 'utf8').trim().length).toBeGreaterThan(0);
    expect(manifest['microfinance-4']!.monogram).toBe('МГ');
  });

  for (const [id, entry] of Object.entries(manifest)) {
    it(`${id} has commissioned light and dark SVGs`, () => {
      expect(Object.keys(entry).sort()).toEqual(['darkFile', 'file', 'license', 'monogram', 'source']);
      expect(entry.file).toBe(`${id}.svg`);
      expect(entry.darkFile).toBe(`${id}-dark.svg`);
      expect(entry.source).toBe('owner-commissioned set, 2026-11-17');
      expect(entry.license).toBe('see FONT-LICENSE.txt');
      expect(entry.monogram.trim().length).toBeGreaterThan(0);
      for (const file of [entry.file, entry.darkFile]) {
        const bytes = readFileSync(join(directory, file));
        expect(bytes.length).toBeGreaterThan(0);
        expect(bytes.length).toBeLessThanOrEqual(40_000);
        const svg = bytes.toString('utf8');
        validateSvg(svg);
        expect(svg.match(/^<svg\s[^>]*\bviewBox="([^"]*)"/)?.[1]).toBe('0 0 64 64');
      }
    });
  }
});

describe('SVG safety guard', () => {
  it.each([
    '<script>alert(1)</script>', '<svg:script/>', '<g onload="alert(1)"/>',
    '<path onclick = "alert(1)"/>', '<use href="https://example.com/a.svg#x"/>',
    '<use xlink:href="//example.com/a.svg"/>', '<use href="data:image/svg+xml,x"/>',
    '<use href="&#104;ttps://example.com"/>', '<path fill="url(https://example.com)"/>',
    '<path fill="url(//example.com)"/>', '<path style="fill:url(https://example.com)"/>',
    '<style>@import "https://example.com";</style>', '<foreignObject/>',
    '<image href="x.png"/>', '<animate attributeName="href"/>',
  ])('rejects unsafe markup: %s', (markup) => {
    expect(() => validateSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)).toThrow();
  });

  it('accepts geometry with local paint and clipping references', () => {
    validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><clipPath id="c"><path d="M0 0h5v5H0z"/></clipPath></defs><path clip-path="url(#c)" fill="#fff" d="M0 0h10v10H0z"/></svg>');
  });
});
