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
type Entry = { file: null; reason: string } | {
  file: string;
  source: string;
  sourceUrl: string;
  license: string;
  retrievedAt: string;
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
  const attributes = new Set(['xmlns', 'xmlns:xlink', 'viewBox', 'width', 'height', 'id', 'd', 'fill',
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

function validatePng(bytes: Buffer): void {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(8)).toBe(13);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  for (const dimension of [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]) {
    expect(dimension).toBeGreaterThan(0);
    expect(dimension).toBeLessThanOrEqual(256);
  }
}

describe('catalog logos (data only)', () => {
  it('covers exactly every catalog company, including logistics and energy', () => {
    expect(Object.keys(manifest).sort()).toEqual([...ids].sort());
  });

  it('has exactly one regular file for each non-null manifest entry', () => {
    const files = Object.values(manifest).flatMap((entry) => entry.file === null ? [] : [entry.file]);
    expect(new Set(files).size).toBe(files.length);
    expect(readdirSync(directory).sort()).toEqual(['logos.json', ...files].sort());
    for (const file of files) expect(lstatSync(join(directory, file)).isFile()).toBe(true);
  });

  for (const [id, entry] of Object.entries(manifest)) {
    it(`${id} has a reason or a sourced, bounded and sanitized logo`, () => {
      if (entry.file === null) {
        expect(Object.keys(entry).sort()).toEqual(['file', 'reason']);
        expect(entry.reason.trim().length).toBeGreaterThan(0);
        return;
      }
      expect(Object.keys(entry).sort()).toEqual(['file', 'license', 'retrievedAt', 'source', 'sourceUrl']);
      expect(entry.file).toMatch(new RegExp(`^${id}\\.(svg|png)$`));
      expect(['official brand page', 'official press page', 'Wikimedia Commons']).toContain(entry.source);
      expect(new URL(entry.sourceUrl).protocol).toBe('https:');
      expect(entry.license.trim().length).toBeGreaterThan(0);
      expect(entry.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(entry.retrievedAt).toISOString().slice(0, 10)).toBe(entry.retrievedAt);
      const bytes = readFileSync(join(directory, entry.file));
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.length).toBeLessThanOrEqual(40_000);
      if (entry.file.endsWith('.svg')) validateSvg(bytes.toString('utf8'));
      else validatePng(bytes);
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

  it('rejects oversized PNG dimensions', () => {
    const bytes = Buffer.alloc(33);
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(bytes);
    bytes.writeUInt32BE(257, 16);
    bytes.writeUInt32BE(1, 20);
    expect(() => validatePng(bytes)).toThrow();
  });
});
