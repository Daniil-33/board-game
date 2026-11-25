import { casinoCap, jailFee } from '@game/game-core';
import type { ActionContext } from '../../entities/game/index';
import { activeDeadline } from '../../entities/game/index';

/** Stage 6 command guards stay in the lazy game route. The core remains authoritative. */
export function canIssueSpecial(ctx: ActionContext, type: 'PayCharge' | 'PlaceCasinoBet' | 'DeclineCasino' | 'PayJailFee'): boolean {
  const { view, me } = ctx;
  if (!view || !me || !ctx.connected || !view.players.some(player => player.id === me) || view.eliminated.includes(me) || ctx.pending.includes(type)) return false;
  if (view.auction !== null || view.phase !== 'playing' || view.turn === null || view.turn.playerId !== me) return false;
  if (type === 'PayJailFee') {
    const fee = jailFee(view.economy);
    return Object.hasOwn(view.jail, me) && !view.turn.rolled && (view.balances[me] ?? 0) >= fee && ctx.now < view.turn.deadline;
  }
  if (type === 'PayCharge') return view.charge?.payerId === me && ctx.now < view.turn.deadline;
  if (type === 'DeclineCasino') return view.casino?.playerId === me && ctx.now < view.turn.deadline;
  const ceiling = view.casino ? Math.min(casinoCap(view.economy), view.balances[me] ?? 0) : 0;
  return view.casino?.playerId === me && view.rent === null && view.charge === null && ceiling >= 10 && ctx.now < view.turn.deadline;
}

