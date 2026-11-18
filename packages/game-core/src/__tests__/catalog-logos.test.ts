import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

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
  monogram?: string;
  source: string;
  license?: string;
  construction?: string;
  sourceRef?: string;
};

const sets = [
  { name: 'geometric', metadata: ['.gitattributes', 'FONT-LICENSE.txt'] },
  { name: 'brand', metadata: ['sources.md'] },
] as const;

// Explicit 20,000-byte exceptions retained pending an owner decision on
// visible geometry simplification. Sizes are asserted so every exception
// stays visible in review if its asset changes.
const brandSizeExceptions = new Map(Object.entries({
  'banks-4-dark.svg': 22_001,
  'banks-4.svg': 22_001,
  'banks-5-dark.svg': 82_788,
  'banks-5.svg': 82_788,
  'commerce-4-dark.svg': 56_044,
  'commerce-4.svg': 56_044,
  'commerce-6-dark.svg': 63_012,
  'commerce-6.svg': 63_012,
  'energy-1-dark.svg': 53_461,
  'energy-1.svg': 53_461,
  'energy-2-dark.svg': 33_726,
  'energy-2.svg': 33_726,
  'fuel-4-dark.svg': 57_933,
  'fuel-4.svg': 57_933,
  'groceries-1-dark.svg': 44_478,
  'groceries-1.svg': 44_478,
  'insurance-6-dark.svg': 58_574,
  'insurance-6.svg': 58_574,
  'media-2-dark.svg': 81_577,
  'media-2.svg': 81_577,
  'media-3-dark.svg': 23_543,
  'media-3.svg': 23_543,
  'microfinance-2-dark.svg': 41_762,
  'microfinance-2.svg': 41_762,
  'microfinance-3-dark.svg': 30_966,
  'microfinance-3.svg': 30_966,
  'microfinance-6-dark.svg': 35_541,
  'microfinance-6.svg': 35_541,
  'technology-5-dark.svg': 25_983,
  'technology-5.svg': 25_983,
  'telecom-3-dark.svg': 37_859,
  'telecom-3.svg': 37_859,
}));

const ids = [
  ...catalog.categories.flatMap(({ companies }) => companies),
  ...catalog.logistics,
  ...catalog.energy,
].map(({ id }) => id);

// Deliberately narrow SVG subset: geometry, gradients and local clipping only.
// Inline stylesheets may only assign local fill and clipping rules to classes.
function validateSvg(svg: string): void {
  expect(svg).toMatch(/^<svg\s/);
  expect(svg.trim()).toMatch(/<\/svg>$/);
  expect(svg).not.toMatch(/<\?|<!|&|\\/);
  const paint = '(?:fill:#[0-9a-fA-F]{3,8}|(?:fill-rule|clip-rule):evenodd)';
  const rule = `\\.[\\w-]+\\s*\\{\\s*${paint}(?:\\s*;\\s*${paint})*\\s*;?\\s*\\}\\s*`;
  const safeCss = new RegExp(`^\\s*(?:${rule})+$`);
  const withoutStyles = svg.replace(/<style(?: type="text\/css")?>([^<]*)<\/style>/g, (_, css: string) => {
    expect(css, 'SVG stylesheet uses only local paint rules').toMatch(safeCss);
    return '';
  });
  const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'use']);
  const attributes = new Set(['xmlns', 'xmlns:xlink', 'role', 'aria-label', 'viewBox', 'width', 'height', 'id', 'd', 'fill',
    'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'clipPathUnits', 'mask', 'maskUnits',
    'maskContentUnits', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
    'transform', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points',
    'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
    'fx', 'fy', 'fr', 'preserveAspectRatio', 'href', 'xlink:href', 'class', 'baseProfile',
    'overflow', 'xml:space', 'data-bbox', 'data-color', 'data-type']);
  for (const tag of withoutStyles.matchAll(/<\/?([^\s/>]+)([^>]*?)\/?\s*>/g)) {
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

describe.each(sets)('$name catalog logos (data only)', ({ name, metadata }) => {
  const root = join(directory, name);
  const manifest = JSON.parse(readFileSync(join(root, 'logos.json'), 'utf8')) as Record<string, Entry>;
  const files = Object.values(manifest).flatMap(({ file, darkFile }) => [file, darkFile]);

  it('covers exactly all 67 catalog companies, including logistics and energy', () => {
    expect(ids).toHaveLength(67);
    expect(Object.keys(manifest).sort()).toEqual([...ids].sort());
  });

  it('has exactly the light and dark regular files plus metadata', () => {
    expect(new Set(files).size).toBe(files.length);
    expect(readdirSync(root).sort()).toEqual(['logos.json', 'README.md', ...metadata, ...files].sort());
    for (const file of files) expect(lstatSync(join(root, file)).isFile()).toBe(true);
  });

  if (name === 'geometric') {
    it('ships the font license and final МГ mark', () => {
      expect(readFileSync(join(root, 'FONT-LICENSE.txt'), 'utf8').trim().length).toBeGreaterThan(0);
      expect(manifest['microfinance-4']!.monogram).toBe('МГ');
    });
  } else {
    it('fits the raw and summed gzip budgets with only the recorded exceptions', () => {
      let raw = 0;
      let gzip = 0;
      const oversized = [];
      for (const file of files) {
        const bytes = readFileSync(join(root, file));
        raw += bytes.length;
        gzip += gzipSync(bytes, { level: 6 }).length; // Match the web container.
        if (bytes.length > 20_000) oversized.push(file);
        expect(brandSizeExceptions.get(file) ?? 0).toBe(bytes.length > 20_000 ? bytes.length : 0);
      }
      expect(oversized.sort()).toEqual([...brandSizeExceptions.keys()].sort());
      expect(raw).toBeLessThanOrEqual(2_200_000);
      expect(gzip).toBeLessThanOrEqual(800_000);
    });

    it('retains geometric-fallback provenance for microfinance-4 in both appearances', () => {
      const entry = manifest['microfinance-4']!;
      expect(entry.source).toBe('geometric fallback');
      expect(entry.construction).toBe('geometric-fallback');
      expect(entry.sourceRef).toBe('../geometric/logos.json');
      const geometricRoot = join(directory, 'geometric');
      expect(readFileSync(join(root, entry.file))).toEqual(readFileSync(join(geometricRoot, entry.file)));
      expect(readFileSync(join(root, entry.darkFile))).toEqual(readFileSync(join(geometricRoot, entry.darkFile)));
    });
  }

  it.each(Object.entries(manifest))('%s has valid provenance and light and dark SVGs', (id, entry) => {
    expect(entry.file).toBe(`${id}.svg`);
    expect(entry.darkFile).toBe(`${id}-dark.svg`);
    if (name === 'geometric') {
      expect(Object.keys(entry).sort()).toEqual(['darkFile', 'file', 'license', 'monogram', 'source']);
      expect(entry.source).toBe('owner-commissioned set, 2026-11-17');
      expect(entry.license).toBe('see FONT-LICENSE.txt');
      expect(entry.monogram?.trim()).toBeTruthy();
    } else {
      expect(Object.keys(entry).sort()).toEqual(['construction', 'darkFile', 'file', 'source', 'sourceRef']);
      if (id !== 'microfinance-4') {
        expect(new URL(entry.source).protocol).toBe('https:');
        expect(['source-vector', 'vectorized-brand-reference', 'simplified-mascot']).toContain(entry.construction);
        expect(entry.sourceRef).toBe('sources.md');
      }
    }
    for (const file of [entry.file, entry.darkFile]) {
      const bytes = readFileSync(join(root, file));
      expect(bytes.length).toBeGreaterThan(0);
      const exception = name === 'brand' ? brandSizeExceptions.get(file) : undefined;
      expect(bytes.length).toBeLessThanOrEqual(exception ?? 20_000);
      const svg = bytes.toString('utf8');
      validateSvg(svg);
      expect(svg.match(/^<svg\s[^>]*\bviewBox="([^"]*)"/)?.[1]).toBe('0 0 64 64');
    }
  });
});

describe('SVG safety guard', () => {
  it.each([
    '<script>alert(1)</script>', '<svg:script/>', '<g onload="alert(1)"/>',
    '<path onclick = "alert(1)"/>', '<use href="https://example.com/a.svg#x"/>',
    '<use xlink:href="//example.com/a.svg"/>', '<use href="data:image/svg+xml,x"/>',
    '<use href="&#104;ttps://example.com"/>', '<path fill="url(https://example.com)"/>',
    '<path fill="url(//example.com)"/>', '<path style="fill:url(https://example.com)"/>',
    '<style>.a{fill:url(https://example.com)}</style>',
    '<style>@media (prefers-color-scheme:dark){.a{fill:#fff}}</style>',
    '<style>@media print{.a{fill:#fff}}</style>',
    '<style>@import "https://example.com";</style>', '<foreignObject/>',
    '<image href="x.png"/>', '<animate attributeName="href"/>',
  ])('rejects unsafe markup: %s', (markup) => {
    expect(() => validateSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)).toThrow();
  });

  it('accepts geometry with local paint and clipping references', () => {
    validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><clipPath id="c"><path d="M0 0h5v5H0z"/></clipPath></defs><path clip-path="url(#c)" fill="#fff" d="M0 0h10v10H0z"/></svg>');
  });
});
