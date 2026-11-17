import { ESLint } from 'eslint';
import assert from 'node:assert/strict';

const eslint = new ESLint();
const cases = [
  ['src/shared/api/probe.ts', "import type { Board } from '../../entities/game/index';", 'boundaries/element-types'],
  ['src/widgets/board/probe.ts', "import { Hud } from '../turn-header/index';", 'boundaries/element-types'],
  ['src/pages/game/probe.ts', "import { BoardScene } from '../../widgets/board/BoardCanvas';", 'boundaries/entry-point'],
  ['src/shared/i18n/probe.ts', "import { formatMoney } from '../lib/index';", 'boundaries/element-types'],
  ['src/shared/api/probe.ts', "import { t } from '../i18n/locales/en.json';", 'boundaries/entry-point'],
  ['src/shared/api/probe.ts', "import { ROUTES } from './routes';", null],
  ['src/shared/api/probe.ts', "import { t } from '../i18n/index';", null],
  ['src/shared/lib/probe.ts', "import { t } from '../i18n/index';", null],
  ['src/pages/game/probe.vue', '<template><p>Untranslated probe</p></template>', '@intlify/vue-i18n/no-raw-text'],
  ['src/pages/game/probe.vue', `<template><p>{{ t('missing.probe') }}</p></template>`, '@intlify/vue-i18n/no-missing-keys'],
  ['src/shared/api/probe.ts', `import { t } from '../i18n/index'; t('missing.probe');`, '@intlify/vue-i18n/no-missing-keys'],
];
for (const [filePath, source, expected] of cases) {
  const results = await eslint.lintText(source, { filePath });
  const errors = results.flatMap(result => result.messages.filter(message => message.severity === 2));
  if (expected) assert(errors.some(error => error.ruleId === expected), `${filePath}: expected ${expected}, got ${JSON.stringify(errors)}`);
  else assert.deepEqual(errors, [], `${filePath}: permitted dependency`);
  console.log(`PASS ${filePath}: ${expected ?? 'permitted import'}`);
}
