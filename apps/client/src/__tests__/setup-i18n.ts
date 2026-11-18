import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanvasTextMetrics } from 'pixi.js';
import { vi } from 'vitest';
import { registerLocales } from '../shared/i18n/index';

registerLocales();

if (typeof document !== 'undefined') {
  // happy-dom has no application entry point. Install the real root tokens for scene tests.
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../shared/config/tokens.css'), 'utf8');
  const style = document.createElement('style');
  style.textContent = css.match(/:root\s*\{[^}]+\}/)?.[0] ?? '';
  document.head.appendChild(style);

  // Supply the canvas operations exercised by scene graph tests.
  const context = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never);
  vi.spyOn(CanvasTextMetrics, 'measureText').mockImplementation((text, textStyle) => ({
    height: Number(textStyle.fontSize) * 1.25,
    width: Array.from(text).length * Number(textStyle.fontSize) * 0.55,
  } as CanvasTextMetrics));
}
