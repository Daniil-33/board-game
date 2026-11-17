import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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
])('%s reaches AA on %s', (text, surface) => {
  const values = [luminance(rgb(text)), luminance(rgb(surface))];
  expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
