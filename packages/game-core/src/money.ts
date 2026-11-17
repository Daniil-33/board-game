import type { Money } from './types.js';

export function Q(x: number): Money {
  return (10 * Math.floor(x / 10)) as Money;
}

import type { PlayerId } from './types.js';
import type { GameEvent } from './engine.js';
import { InvariantViolationError } from './invariants.js';
export type BalanceChanged = GameEvent<{readonly playerId: PlayerId; readonly delta: Money; readonly balance: Money; readonly reason: 'starting-capital' | 'lap-reward' | 'purchase' | 'auction' | 'rent' | 'build' | 'house-sale' | 'mortgage' | 'redeem'}, 'BalanceChanged'>;
export type BalanceChangedEvent = BalanceChanged;
export function startingCapital(n: number): Money {
  if (!Number.isInteger(n) || n < 2 || n > 6) throw new RangeError('Player count must be 2..6');
  return (10 * Math.floor(600 * 56740 / (569 * n * 10))) as Money;
}
export function lapReward(capital: Money): Money { return (10 * Math.floor(2 * capital / 150)) as Money; }
export function creditBalance(balances: Readonly<Record<string, Money>>, playerId: PlayerId, delta: Money, reason: BalanceChanged['payload']['reason']): {balances: Readonly<Record<string, Money>>; event: BalanceChanged} {
  const previous = Object.hasOwn(balances, playerId) ? balances[playerId]! : 0;
  const balance = (previous + delta) as Money;
  if (!Number.isSafeInteger(delta) || delta < 0 || delta % 10 !== 0 || !Number.isSafeInteger(balance) || balance < 0 || balance % 10 !== 0) throw new InvariantViolationError('balances', 'Invalid credit');
  return {balances: {...balances, [playerId]: balance}, event: {type: 'BalanceChanged', payload: {playerId, delta, balance, reason}}};
}

/** Debit only validated affordable quanta; callers reject user insufficiency first. */
export function debitBalance(balances: Readonly<Record<string, Money>>, playerId: PlayerId, amount: Money, reason: 'purchase' | 'auction' | 'rent' | 'build' | 'redeem'): { balances: Readonly<Record<string, Money>>; event: BalanceChanged } {
  const previous = Object.hasOwn(balances, playerId) ? balances[playerId]! : 0;
  const balance = (previous - amount) as Money;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount % 10 !== 0 || !Number.isSafeInteger(balance) || balance < 0 || balance % 10 !== 0) throw new InvariantViolationError('balances', 'Invalid debit');
  return { balances: { ...balances, [playerId]: balance }, event: { type: 'BalanceChanged', payload: { playerId, delta: -amount as Money, balance, reason } } };
}
