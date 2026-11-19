import { expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { boardTheme, parseCssColors } from '../shared/config/index';

const tokens = readFileSync(import.meta.dirname + '/../shared/config/tokens.css', 'utf8');

function rgb(name: string): number[] {
  const value = tokens.match(new RegExp(`^  --${name}: ([^;]+);`, 'm'))?.[1];
  if (!value) throw new Error(`Missing color token: ${name}`);
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.slice(1).match(/../g)!.map(channel => Number.parseInt(channel, 16));
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!rgba) throw new Error(`Unsupported color token ${name}: ${value}`);
  const alpha = Number(rgba[4]);
  return rgb('bg-base').map((base, index) => Number(rgba[index + 1]) * alpha + base * (1 - alpha));
}

function luminance(rgb: number[]): number {
  const weights = [0.2126, 0.7152, 0.0722];
  return rgb.reduce((sum, channel, index) => {
    const srgb = channel / 255;
    const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    return sum + weights[index]! * linear;
  }, 0);
}

it.each([
  ...['text-primary', 'text-secondary', 'text-muted', 'text-disabled', 'warning-text', 'danger-text']
    .flatMap(text => ['bg-base', 'surface-1', 'surface-2', 'bg-deep'].map(surface => [text, surface])),
  ['ink-primary', 'light-1'],
  ['ink-secondary', 'light-1'],
  ['danger-on-light', 'danger-surface'],
  ['on-accent', 'accent-blue'],
  ['on-accent', 'accent-mint'],
  ...Array.from({ length: 6 }, (_, index) => ['on-accent', `player-${index + 1}`]),
])('%s reaches AA on %s', (text, surface) => {
  const values = [luminance(rgb(text)), luminance(rgb(surface))];
  expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)).toBeGreaterThanOrEqual(4.5);
});

const boardGradients = [...tokens.matchAll(/^\s*--((?:group|gradient-board)-[^:]+):/gm)].map(([, name]) => name!);

it.each(boardGradients)('parses at least two Pixi color stops from --%s', name => {
  const theme = boardTheme();
  const stops = name === 'gradient-board-frame'
    ? theme.frame
    : name.startsWith('group-')
      ? theme.group(name.slice('group-'.length))
      : theme.special(name.slice('gradient-board-'.length));
  expect(stops.length).toBeGreaterThanOrEqual(2);
});

it.each([
  ['#abc', ['#abc']], ['#abcd', ['#abcd']], ['#aabbcc', ['#aabbcc']], ['#aabbccdd', ['#aabbccdd']],
  ['rgb(12, 34, 56)', ['rgb(12, 34, 56)']], ['rgba(12, 34, 56, 0.5)', ['rgba(12, 34, 56, 0.5)']],
  ['rgb(12 34 56)', ['rgb(12 34 56)']], ['rgb(12 34 56 / 50%)', ['rgb(12 34 56 / 50%)']],
  ['red, rebeccapurple', ['red', 'rebeccapurple']],
])('parses CSS color syntax %s', (input, expected) => {
  expect(parseCssColors(input)).toEqual(expected);
});

it('parses the exact minified board color declarations, including alpha and non-color layers', () => {
  const exactMinified = [
    'linear-gradient(145deg,#7cc4ff38,#5cf0c01a 40%,#f25c9a24),none',
    'linear-gradient(135deg,#b9f5e1,#9ccbff)',
    'linear-gradient(135deg,#e2e8f0,#b8c2d4)',
    'repeating-linear-gradient(135deg,#d5dbe6 0px,#d5dbe6 6px,#e6eaf1 6px,#e6eaf1 12px)',
    '--group-m1:linear-gradient(90deg,#c4b5fd,#9b7bff)',
  ];
  expect(exactMinified.map(parseCssColors)).toEqual([
    ['#7cc4ff38', '#5cf0c01a', '#f25c9a24'],
    ['#b9f5e1', '#9ccbff'],
    ['#e2e8f0', '#b8c2d4'],
    ['#d5dbe6', '#d5dbe6', '#e6eaf1', '#e6eaf1'],
    ['#c4b5fd', '#9b7bff'],
  ]);
});

const builtAssets = join(import.meta.dirname, '../../dist/assets');

it.skipIf(!existsSync(builtAssets))('keeps two parsed colors for every board color token in built CSS (run build:bundle first)', () => {
  const cssFiles = readdirSync(builtAssets).filter(file => file.endsWith('.css'));
  expect(cssFiles.length, 'client production CSS should be built before running tests').toBeGreaterThan(0);
  const css = cssFiles.map(file => readFileSync(join(builtAssets, file), 'utf8')).join('\n');
  const exactDeclarations = [
    '--gradient-board-frame:linear-gradient(145deg,#7cc4ff38,#5cf0c01a 40%,#f25c9a24),none',
    '--light-mortgage:repeating-linear-gradient(135deg,#d5dbe6 0px,#d5dbe6 6px,#e6eaf1 6px,#e6eaf1 12px)',
  ];
  for (const declaration of exactDeclarations) expect(css).toContain(declaration);
  const declarations = [...css.matchAll(/--((?:group|gradient-board)-[\w-]+|light-mortgage):([^;}]+)/g)];
  expect(declarations.length).toBeGreaterThan(0);
  for (const [, name, value] of declarations) {
    expect(parseCssColors(value!).length, `built --${name} should yield at least two colors: ${value}`).toBeGreaterThanOrEqual(2);
  }
});
