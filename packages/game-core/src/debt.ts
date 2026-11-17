import type { AssetId, Money, PlayerId, Timestamp } from './types.js';
import type { GameState } from './state.js';
import type { GameEvent } from './engine.js';
import { rentFor, isMortgaged, type RentPaid } from './rent.js';
import { applyMortgage, mortgageAdvance, removeMortgageParticipant } from './mortgage.js';
import { applyHouseSale, houseCost, houseRefund } from './houses.js';
import { creditBalance, debitBalance } from './money.js';
import { cancelOffersOf, releaseAssets } from './resignation.js';

export interface Debt {
  readonly payerId: PlayerId;
  readonly creditorId: PlayerId;
  readonly amount: Money;
  readonly cause: { readonly kind: 'rent'; readonly assetId: AssetId; readonly auto: boolean };
}
export interface LiquidationStep {
  readonly tier: 1 | 2 | 3;
  readonly kind: 'mortgage' | 'sell-house';
  readonly assetId: AssetId;
  readonly amount: Money;
}
export type LiquidationApplied = GameEvent<{readonly payerId: PlayerId; readonly creditorId: PlayerId; readonly debt: Money; readonly cashBefore: Money; readonly raised: Money; readonly steps: readonly LiquidationStep[]}, 'LiquidationApplied'>;
export type PlayerBankrupt = GameEvent<{readonly playerId: PlayerId; readonly creditorId: PlayerId; readonly debt: Money; readonly paid: Money; readonly writtenOff: Money}, 'PlayerBankrupt'>;
export type DebtEvent = LiquidationApplied | PlayerBankrupt;
export type DebtResult = {state: GameState; events: GameEvent[]; bankrupt: boolean};
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Atomic raising and payment. Turn scheduling remains the caller's responsibility. */
export function settleDebt(initial: GameState, debt: Debt, now: Timestamp): DebtResult {
  const {payerId, creditorId, amount, cause} = debt;
  let state = initial;
  const events: GameEvent[] = [];
  const assets = initial.board!.cells.flatMap(c => c.asset && initial.owners[c.asset.assetId] === payerId ? [c.asset] : []);
  type Asset = (typeof assets)[number];
  const cash = () => state.balances[payerId]!;
  const built = (a: Asset) => state.houses[a.assetId] ?? 0;
  const compare = (a: Asset, b: Asset) => rentFor(state, a.assetId, 7) - rentFor(state, b.assetId, 7) || a.price - b.price || lexical(a.assetId, b.assetId);
  const groups = [...new Set(assets.map(a => a.groupId))];
  const complete = new Set(groups.filter(id => initial.board!.cells.filter(c => c.asset?.groupId === id).every(c => initial.owners[c.asset!.assetId] === payerId)));
  const groupKey = (id: string) => {
    const members = assets.filter(a => a.groupId === id && built(a) > 0);
    return [members.reduce((n,a) => n + rentFor(state,a.assetId,7),0), members.reduce((n,a) => n + a.price,0)];
  };
  const chooseGroup = () => groups.filter(id => assets.some(a => a.groupId === id && built(a) > 0)).sort((a,b) => {
    const x = groupKey(a), y = groupKey(b);
    return x[0]! - y[0]! || x[1]! - y[1]! || lexical(a,b);
  })[0];
  const saleAsset = (group: string) => assets.filter(a => a.groupId === group && built(a) > 0).sort((a,b) => built(b) - built(a) || compare(a,b))[0]!;
  const apply = (asset: Asset, kind: LiquidationStep['kind']) => {
    const result = kind === 'mortgage' ? applyMortgage(state,payerId,asset.assetId,true) : applyHouseSale(state,payerId,asset.assetId,true);
    state = result.state; events.push(...result.events);
  };
  const transfer = (paid: Money) => {
    if (paid === 0) return;
    const debit = debitBalance(state.balances,payerId,paid,'rent');
    const credit = creditBalance(debit.balances,creditorId,paid,'rent');
    state = {...state, balances: credit.balances}; events.push(debit.event,credit.event);
  };
  const fullValue = cash() + assets.reduce((n,a) => n + built(a) * houseRefund(houseCost(a.price)) + (isMortgaged(state,a.assetId) ? 0 : mortgageAdvance(a.price)),0);
  if (cash() < amount && fullValue < amount) {
    let group: string | undefined;
    while ((group = chooseGroup()) !== undefined) {
      while (assets.some(a => a.groupId === group && built(a) > 0)) apply(saleAsset(group),'sell-house');
    }
    const paid = Math.min(amount,cash()) as Money;
    transfer(paid);
    const released = releaseAssets(state,payerId,'bankrupt');
    state = released.state; events.push(...released.events);
    events.push({type:'PlayerBankrupt',payload:{playerId:payerId,creditorId,debt:amount,paid,writtenOff:amount-paid as Money}} satisfies PlayerBankrupt);
    state = cancelOffersOf(state,payerId);
    state = removeMortgageParticipant({...state, eliminated:[...state.eliminated,payerId],
      eliminations:[...state.eliminations,{playerId:payerId,creditorId,reason:'bankrupt',at:now}],
      order:state.order!.filter(p => p !== payerId),
      positions:Object.fromEntries(Object.entries(state.positions).filter(([p]) => p !== payerId)),
      jail:Object.fromEntries(Object.entries(state.jail).filter(([p]) => p !== payerId)),
      rent:null, turn:{...state.turn!,pendingBonus:false}},payerId);
    return {state,events,bankrupt:true};
  }
  if (cash() < amount) {
    const cashBefore = cash();
    const steps: LiquidationStep[] = [];
    const step = (a: Asset, kind: LiquidationStep['kind'], tier: LiquidationStep['tier']) => {
      const before = cash(); apply(a,kind);
      steps.push({tier,kind,assetId:a.assetId,amount:cash()-before as Money});
    };
    for (const tier of [1,2] as const) {
      while (cash() < amount) {
        const a = assets.filter(a => built(a) === 0 && !isMortgaged(state,a.assetId) && complete.has(a.groupId) === (tier === 2)).sort(compare)[0];
        if (!a) break;
        step(a,'mortgage',tier);
      }
    }
    while (cash() < amount) {
      const group = chooseGroup();
      if (group === undefined) throw new Error('Solvent debt exhausted liquidation assets');
      while (cash() < amount && assets.some(a => a.groupId === group && built(a) > 0)) {
        const a = saleAsset(group);
        step(a,'sell-house',3);
        if (cash() < amount && built(a) === 0) step(a,'mortgage',3);
      }
    }
    events.push({type:'LiquidationApplied',payload:{payerId,creditorId,debt:amount,cashBefore,raised:cash()-cashBefore as Money,steps}} satisfies LiquidationApplied);
  }
  transfer(amount);
  events.push({type:'RentPaid',payload:{payerId,ownerId:creditorId,assetId:cause.assetId,amount,auto:cause.auto}} satisfies RentPaid);
  return {state:{...state,rent:null},events,bankrupt:false};
}
