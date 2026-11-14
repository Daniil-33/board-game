import type { Money } from './types.js';

export function Q(x: number): Money {
  return (10 * Math.floor(x / 10)) as Money;
}
