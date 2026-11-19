#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const catalog = read('packages/game-core/src/catalog/ua-1.json');
const brand = read('packages/game-core/src/catalog/logos/brand/logos.json');
const geometric = read('packages/game-core/src/catalog/logos/geometric/logos.json');
const companies = [...catalog.categories.flatMap(({ companies }) => companies), ...catalog.logistics, ...catalog.energy];
const rows = companies.map(({ id, name }) => {
  const brandEntry = brand[id];
  const geometricEntry = geometric[id];
  let set = 'monogram';
  let source = 'catalog-derived monogram; no logo manifest entry';
  if (brandEntry?.construction === 'geometric-fallback') {
    set = 'geometric';
    source = geometricEntry?.source ?? brandEntry.source;
  } else if (brandEntry?.file) {
    set = 'brand';
    source = brandEntry.source;
  } else if (geometricEntry?.file) {
    set = 'geometric';
    source = geometricEntry.source;
  } else if (geometricEntry) {
    source = geometricEntry.source ?? 'manifest monogram';
  }
  return { id, name, set, source };
});

if (rows.length !== 67) throw new Error(`Expected 67 catalog companies, found ${rows.length}`);
const output = process.argv[2] ?? '/srv/agents/evidence/TASK-vd-e2e/logo-coverage.md';
const counts = Object.groupBy(rows, row => row.set);
const markdown = [
  '# Catalog logo coverage',
  '',
  `Generated from the catalog and logo manifests. Runtime default is brand; ${counts.geometric?.length ?? 0} entry uses the geometric fallback and ${counts.monogram?.length ?? 0} uses a monogram.`,
  '',
  '| Company ID | Catalog name | Logo set used | Recorded source |',
  '| --- | --- | --- | --- |',
  ...rows.map(row => `| \`${row.id}\` | ${row.name.replaceAll('|', '\\|')} | ${row.set} | ${row.source.replaceAll('|', '\\|')} |`),
  '',
].join('\n');
writeFileSync(resolve(output), markdown);
console.log(`Wrote ${rows.length} companies to ${output}`);
