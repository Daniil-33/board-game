// Browser assertions expect Russian digit groups. Playwright normalizes whitespace.
export const money = (value: number | undefined): string => value === undefined ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
