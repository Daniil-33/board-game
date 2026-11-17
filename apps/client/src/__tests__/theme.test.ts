import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(import.meta.dirname + '/../shared/config/tokens.css', 'utf8');

function rgb(name: string): number[] {
  const hex = tokens.match(new RegExp(`^  --${name}: #([0-9a-f]{6});`, 'im'))?.[1];
  if (!hex) throw new Error(`Missing color token: ${name}`);
  return hex.match(/../g)!.map(channel => Number.parseInt(channel, 16));
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
  ['text-primary', 'bg-base'],
  ['text-secondary', 'bg-base'],
  ['text-muted', 'bg-base'],
  ['text-disabled', 'bg-base'],
  ['ink-primary', 'light-1'],
  ['ink-secondary', 'light-1'],
  ['warning-text', 'bg-base'],
  ['danger-text', 'bg-base'],
  ['danger-on-light', 'danger-surface'],
  ['on-accent', 'accent-blue'],
  ['on-accent', 'accent-mint'],
])('%s reaches AA on %s', (text, surface) => {
  const values = [luminance(rgb(text)), luminance(rgb(surface))];
  expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
