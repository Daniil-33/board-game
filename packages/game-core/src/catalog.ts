import data from './catalog/ua-1.json' with { type: 'json' };
export interface Company {
  readonly id: string;
  readonly name: string;
}
export interface Category extends Company {
  readonly companies: readonly Company[];
}
export interface Catalog {
  readonly version: string;
  readonly categories: readonly Category[];
  readonly logistics: readonly Company[];
  readonly energy: readonly Company[];
}
export function validateCatalog(value: unknown): asserts value is Catalog {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid catalog');
  const c = value as Catalog;
  const ids = new Set<string>();
  function entry(v: Company): void {
    if (!v || typeof v.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(v.id) || typeof v.name !== 'string' || !v.name || ids.has(v.id))
      throw new Error('Invalid catalog entry');
    ids.add(v.id);
  }
  if (c.version !== 'ua-1' || !Array.isArray(c.categories) || c.categories.length !== 10 || !Array.isArray(c.logistics) || c.logistics.length !== 6 || !Array.isArray(c.energy) || c.energy.length !== 4)
    throw new Error('Invalid catalog shape');
  for (const category of c.categories) {
    entry(category);
    if (!Array.isArray(category.companies) || category.companies.length < 3)
      throw new Error('Insufficient companies');
    category.companies.forEach(entry);
  }
  c.logistics.forEach(entry);
  c.energy.forEach(entry);
}
validateCatalog(data);
export const CATALOG: Catalog = data;
