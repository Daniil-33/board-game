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
