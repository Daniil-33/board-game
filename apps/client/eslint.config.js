import boundaries from 'eslint-plugin-boundaries';
import ts from 'typescript-eslint';
import vue from 'vue-eslint-parser';
import i18nLint from '@intlify/eslint-plugin-vue-i18n';

import { designRules } from './scripts/design-rules.mjs';

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

// TS-side presentation checks complement template raw-text lint. Imports, console
// diagnostics and ordinary Error/RangeError diagnostics are implementation data.
const rawTextChecks = [
  {
    selector: "AssignmentExpression[left.property.name='text'] > Literal.right[value=/[A-Za-z]/], AssignmentExpression[left.property.name='text'] > TemplateLiteral.right > TemplateElement[value.raw=/[A-Za-z]/]",
    message: 'Translate assigned Pixi or presentation text, including single-word captions.',
  },
  {
    selector: "Literal[value=/[A-Za-z]{2,}\\s+[A-Za-z]{2,}/]:not(ImportDeclaration > Literal):not(CallExpression[callee.object.name='console'] > Literal):not(NewExpression[callee.name=/^(Error|RangeError|TypeError)$/] > Literal)",
    message: 'Move client-owned display prose to a literal translation key.',
  },
  {
    selector: "TemplateElement[value.raw=/[A-Za-z]{2,}\\s+[A-Za-z]{2,}/]:not(NewExpression[callee.name=/^(Error|RangeError|TypeError)$/] > TemplateLiteral > TemplateElement):not(CallExpression[callee.object.name='console'] > TemplateLiteral > TemplateElement)",
    message: 'Move client-owned display prose to a named-interpolation translation.',
  },
  {
    selector: "CallExpression[callee.name='label'] > Literal.arguments[value=/[A-Za-z]/], CallExpression[callee.name='label'] > TemplateLiteral.arguments > TemplateElement[value.raw=/[A-Za-z]/], NewExpression[callee.name='Text'] > ObjectExpression > Property[key.name='text'] > Literal.value[value=/[A-Za-z]/]",
    message: 'Translate Pixi display captions.',
  },
  {
    selector: "VariableDeclarator[id.name=/^(caption|message|label|text|notice|msg)$/] > Literal.init[value=/[A-Za-z]/], VariableDeclarator[id.name=/^(HOUSE_REASONS|MORTGAGE_REASONS|ELIMINATION_TEXT)$/] ObjectExpression > Property > Literal.value[value=/[A-Za-z]/]",
    message: 'Translate presentation strings and reason-map values.',
  },
];

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/__tests__/**', 'mock/**'] },
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: { parser: ts.parser },
    plugins: { boundaries, '@intlify/vue-i18n': i18nLint },
    settings: {
      'vue-i18n': { localeDir: './src/shared/i18n/locales/ru.json', messageSyntaxVersion: '^11.0.0' },
      'import/resolver': { node: { extensions: ['.ts', '.vue', '.js', '.json'] } },
      'boundaries/dependency-nodes': ['import', 'export', 'dynamic-import'],
      'boundaries/elements': layers.map(type => ({ type, pattern: type === 'app' ? 'src/app' : `src/${type}/*`, mode: 'folder', capture: ['slice'] })),
    },
    rules: {
      'boundaries/element-types': ['error', { default: 'disallow', rules: [...layers.map((from, i) => ({ from, allow: layers.slice(i + 1) })), { from: 'shared', allow: ['shared'] }, { from: [['shared', { slice: 'i18n' }]], disallow: ['shared'] }] }],
      'boundaries/entry-point': ['error', { default: 'disallow', rules: [{ target: layers, allow: ['index.ts'] }] }],
      '@intlify/vue-i18n/no-missing-keys': 'error',
      'no-restricted-syntax': ['error', ...rawTextChecks],
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
    },
  },
  { files: ['src/**/*.ts', 'src/**/*.vue'], ignores: ['src/shared/config/**'], plugins: { design: designRules }, rules: { 'design/no-raw-color': 'error' } },
  { files: ['src/**/*.vue'], rules: { '@intlify/vue-i18n/no-raw-text': ['error', { attributes: { '/.*/': ['aria-label', 'title', 'placeholder', 'alt'] } }] }, languageOptions: { parser: vue, parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'], sourceType: 'module' } } },
];
