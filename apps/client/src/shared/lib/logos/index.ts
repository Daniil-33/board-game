// Catalog files live with the authoritative assets. Vite resolves them at build time.
const [geometric] = Object.values(import.meta.glob<Record<string, { monogram?: string }>>(
  '../../../../../../packages/game-core/src/catalog/logos/geometric/logos.json',
  { import: 'default', eager: true },
));
const [catalog] = Object.values(import.meta.glob<{
  categories: { companies: Company[] }[];
  logistics: Company[];
  energy: Company[];
}>('../../../../../../packages/game-core/src/catalog/ua-1.json', { import: 'default', eager: true }));

interface Company { id: string; name: string }

const urls = import.meta.glob<string>(
  '../../../../../../packages/game-core/src/catalog/logos/{brand,geometric}/*.svg',
  { query: '?url', import: 'default', eager: true },
);

/** Resolve a URL synchronously. The caller decides when to fetch the SVG. */
export function logoUrl(companyId: string, { dark }: { dark: boolean }): string | null {
  const set = window.__GAME_CONFIG__?.logoSet === 'geometric' ? 'geometric' : 'brand';
  const filename = dark ? `${companyId}-dark.svg` : `${companyId}.svg`;
  // A dark variant filename is not a company ID.
  if (companyId.endsWith('-dark')) return null;
  return urls[`../../../../../../packages/game-core/src/catalog/logos/${set}/${filename}`] ?? null;
}

const companies = [...catalog!.categories.flatMap(({ companies }) => companies), ...catalog!.logistics, ...catalog!.energy];
const names = new Map(companies.map(({ id, name }) => [id, name]));

/** The commissioned geometric set supplies the fallback for either logo set. */
export function logoMonogram(companyId: string): string {
  const name = names.get(companyId);
  if (name === undefined) return '';
  return geometric?.[companyId]?.monogram || (name.match(/\p{L}/gu) ?? []).slice(0, 2).join('').toUpperCase();
}
