import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../packages/game-core/src/catalog/logos/geometric/logos.json', async (original) => {
  const { default: manifest } = await original<{ default: typeof import('../../../../packages/game-core/src/catalog/logos/geometric/logos.json') }>();
  return { default: { ...manifest, 'banks-3': {} } };
});

import { logoMonogram } from '../shared/lib/logos';
import { registerLocales, i18n } from '../shared/i18n/index';
import { registerSpecialCellLocales } from '../widgets/special-cells/locales';

describe('lazy stage 6 locale registration', () => {
  it.each(['ru', 'en'] as const)('preserves logo fallback after production registration order (%s)', (locale) => {
    // The app entry loads its base messages before the lazy game route adds its extension.
    registerLocales();
    registerSpecialCellLocales();
    i18n.global.locale.value = locale;

    expect(logoMonogram('banks-3')).toBe('MO');
  });
});
