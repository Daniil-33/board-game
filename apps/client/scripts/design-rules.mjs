import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import vue from 'vue-eslint-parser';
import tsEslint from 'typescript-eslint';

const color = /(?:^|[^\w#])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f\w])|\brgba?\(\s*[\d.]+|\b0x[\da-f]{6,8}\b/i;

export const designRules = {
  rules: {
    'no-raw-color': {
      meta: { schema: [] },
      create(context) {
        return {
          Program(node) {
            const source = context.sourceCode;
            const text = source.getText().replace(/<!--[^]*?-->|\/\*[^]*?\*\//g, '');
            if (color.test(text)) context.report({ node, message: 'Use a shared configuration color token.' });
          },
        };
      },
    },
  },
};

export function findSharedCycle(root, overrides = new Map()) {
  const segments = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  const edges = new Map(segments.map(segment => [segment, new Set()]));
  for (const segment of segments) {
    const folder = resolve(root, segment);
    const files = new Set(readdirSync(folder, { recursive: true }).map(file => resolve(folder, file)));
    for (const file of overrides.keys()) if (file.startsWith(folder + '/')) files.add(file);
    for (const file of files) {
      if (!/\.(ts|vue)$/.test(file)) continue;
      const source = overrides.get(file) ?? readFileSync(file, 'utf8');
      const script = file.endsWith('.vue')
        ? vue.parseForESLint(source, { parser: tsEslint.parser, sourceType: 'module', filePath: file }).services.getDocumentFragment()?.children
          .filter(node => node.type === 'VElement' && node.name === 'script')
          .flatMap(node => node.children.map(child => child.value ?? '')).join('\n') ?? ''
        : source;
      const tree = ts.createSourceFile(file + '.ts', script, ts.ScriptTarget.Latest, true);
      function visit(node) {
        let specifier;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0];
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
        if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.startsWith('.')) {
          const target = relative(root, resolve(dirname(file), specifier.text)).split('/')[0];
          if (target !== segment && edges.has(target)) edges.get(segment).add(target);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  const visited = new Set();
  function search(segment, path) {
    if (path.includes(segment)) return [...path, segment];
    if (visited.has(segment)) return;
    visited.add(segment);
    for (const next of edges.get(segment)) {
      const cycle = search(next, [...path, segment]);
      if (cycle) return cycle;
    }
  }
  for (const segment of segments) {
    const cycle = search(segment, []);
    if (cycle) return cycle;
  }
}
