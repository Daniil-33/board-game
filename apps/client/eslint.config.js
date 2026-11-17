import boundaries from 'eslint-plugin-boundaries';
import ts from 'typescript-eslint';
import vue from 'vue-eslint-parser';

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/__tests__/**', 'mock/**'] },
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: { parser: ts.parser },
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.vue', '.js', '.json'] } },
      'boundaries/elements': layers.map(type => ({ type, pattern: type === 'app' ? 'src/app' : `src/${type}/*`, mode: 'folder', capture: ['slice'] })),
    },
    rules: {
      'boundaries/element-types': ['error', { default: 'disallow', rules: layers.map((from, i) => ({ from, allow: layers.slice(i + 1) })) }],
      'boundaries/entry-point': ['error', { default: 'disallow', rules: [{ target: layers, allow: ['index.ts'] }] }],
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
    },
  },
  { files: ['src/**/*.vue'], languageOptions: { parser: vue, parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'], sourceType: 'module' } } },
];
