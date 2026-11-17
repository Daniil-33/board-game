import boundaries from 'eslint-plugin-boundaries';
import ts from 'typescript-eslint';
import vue from 'vue-eslint-parser';
import i18nLint from '@intlify/eslint-plugin-vue-i18n';

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/__tests__/**', 'mock/**'] },
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: { parser: ts.parser },
    plugins: { boundaries, '@intlify/vue-i18n': i18nLint },
    settings: {
      'vue-i18n': { localeDir: './src/shared/i18n/locales/en.json', messageSyntaxVersion: '^11.0.0' },
      'import/resolver': { node: { extensions: ['.ts', '.vue', '.js', '.json'] } },
      'boundaries/elements': layers.map(type => ({ type, pattern: type === 'app' ? 'src/app' : `src/${type}/*`, mode: 'folder', capture: ['slice'] })),
    },
    rules: {
      'boundaries/element-types': ['error', { default: 'disallow', rules: [...layers.map((from, i) => ({ from, allow: layers.slice(i + 1) })), { from: [['shared', { slice: 'api' }], ['shared', { slice: 'lib' }]], allow: [['shared', { slice: 'i18n' }]] }] }],
      'boundaries/entry-point': ['error', { default: 'disallow', rules: [{ target: layers, allow: ['index.ts'] }] }],
      '@intlify/vue-i18n/no-missing-keys': 'error',
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
    },
  },
  { files: ['src/**/*.vue'], rules: { '@intlify/vue-i18n/no-raw-text': ['error', { attributes: { '/.*/': ['aria-label', 'title', 'placeholder', 'alt'] } }] }, languageOptions: { parser: vue, parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'], sourceType: 'module' } } },
];
