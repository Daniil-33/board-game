import type { Money, PlayerId } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import type { GameState } from './state.js';
import { fail, ok, targetGuard, type CommandRegistry } from './registry.js';
import { debitBalance, creditBalance } from './money.js';
import { nextIntInclusive } from './rng.js';
import { CLASSIC_40, movePlayer } from './board.js';
import { offerPurchase, type PurchaseAuctionEvent } from './purchase-auction.js';
import { offerRent } from './rent.js';
import { openCharge } from './rent.js';
import { settleDebt } from './debt.js';
import type { TransitionContext } from './context.js';

export const casinoCap = (economy: GameState['economy']): Money => economy ? (10 * Math.floor(economy.startingCapital / 100)) as Money : 0 as Money;
export const jailFee = (economy: GameState['economy']): Money => economy ? (10 * Math.floor(economy.lapReward / 40)) as Money : 0 as Money;

export type CasinoOffered = GameEvent<{readonly playerId: PlayerId; readonly cap: Money}, 'CasinoOffered'>;
export type CasinoResolved = GameEvent<{readonly playerId: PlayerId; readonly amount: Money; readonly won: boolean; readonly balance: Money}, 'CasinoResolved'>;
export type CasinoDeclined = GameEvent<{readonly playerId: PlayerId; readonly auto: boolean}, 'CasinoDeclined'>;
export type ChanceDrawn = GameEvent<{readonly playerId: PlayerId; readonly card: 'gain-5'|'loss-5'|'gain-10'|'loss-10'; readonly amount: Money}, 'ChanceDrawn'>;
export type JailAttemptFailed = GameEvent<{readonly playerId: PlayerId; readonly attemptsUsed: number}, 'JailAttemptFailed'>;
export type JailReleased = GameEvent<{readonly playerId: PlayerId; readonly reason: 'double'|'fee'|'fee-forced'; readonly fee?: Money}, 'JailReleased'>;

/** Dispatch a landing after movement. Lap reward has already been applied by movePlayer. */
export function landOn(state: GameState, playerId: PlayerId, diceSum: number) {
  const cell = CLASSIC_40.cells[state.positions[playerId]!]!;
  if (cell.kind === 'start' || cell.kind === 'jail') return {state, events: [] as GameEvent[]};
  if (cell.kind === 'monopoly' || cell.kind === 'logistics' || cell.kind === 'energy') {
    const purchase = offerPurchase(state);
    const rent = offerRent(purchase.state, diceSum);
    return {state: rent.state, events: [...purchase.events, ...rent.events]};
  }
  if (cell.kind === 'casino') {
    const cap = casinoCap(state.economy);
    return {state: {...state, casino:{playerId,turnId:state.turn!.turnId,cap}}, events:[{type:'CasinoOffered',payload:{playerId,cap}}] as GameEvent[]};
  }
  if (cell.kind === 'chance') {
    const [n,rng] = nextIntInclusive(state.rng!,0,3);
    const card = (['gain-5','loss-5','gain-10','loss-10'] as const)[n]!;
    const percent = card.endsWith('5') ? 5 : 10;
    const amount = (10 * Math.floor(state.economy!.startingCapital * percent / 1000)) as Money;
    const drawn: ChanceDrawn = {type:'ChanceDrawn',payload:{playerId,card,amount}};
    if (card.startsWith('gain')) {
      const credited=creditBalance(state.balances,playerId,amount,'chance');
      return {state:{...state,rng,balances:credited.balances},events:[drawn,credited.event]};
    }
    const opened=openCharge({...state,rng},amount);
    return {state:opened.state,events:[drawn,...opened.events]};
  }
  const from = state.positions[playerId]!;
  const { [playerId]: _entry, ...jail } = state.jail;
  return {state:{...state,positions:{...state.positions,[playerId]:CLASSIC_40.jailCell},jail:{...jail,[playerId]:{attemptsUsed:0}},turn:{...state.turn!,rolled:true,doublesStreak:0,pendingBonus:false}},events:[{type:'SentToJail',payload:{playerId,from,to:CLASSIC_40.jailCell}}] as GameEvent[],closed:true};
}

export function closeCasino(state: GameState) {
  if (!state.casino) return {state,events:[] as GameEvent[]};
  const playerId=state.casino.playerId;
  return {state:{...state,casino:null},events:[{type:'CasinoDeclined',payload:{playerId,auto:true}} as CasinoDeclined]};
}

export const specialCellCommands: CommandRegistry = {
  PlaceCasinoBet:{guard:targetGuard('turn',s=>s.turn?.turnId??null),allowedActors:['player'],allowedPhases:['playing'],handle(state,command,context){
    const p=command.payload as {amount?:unknown}|null;
    if(!p||typeof p!=='object'||!Number.isSafeInteger(p.amount)) return fail('INVALID_PAYLOAD','PlaceCasinoBet requires integer amount');
    if(state.auction) return fail('AUCTION_IN_PROGRESS','Turn paused');
    if(command.actor.kind!=='player'||command.actor.id!==state.turn!.playerId) return fail('NOT_ACTIVE_PLAYER','Not your turn');
    if(context.now>=state.turn!.deadline) return fail('DEADLINE_PASSED','Turn expired');
    if(!state.casino||state.casino.playerId!==command.actor.id||state.casino.turnId!==state.turn!.turnId) return fail('NO_CASINO','No casino decision');
    if(state.rent||state.charge) return fail('PAYMENT_PENDING','Payment pending');
    const amount=p.amount as number, maximum=Math.min(state.casino.cap,state.balances[command.actor.id]!);
    if(amount<10||amount>maximum||amount%10!==0) return fail('INVALID_BET','Bet must be 10-unit amount within cap and cash');
    const [outcome,rng]=nextIntInclusive(state.rng!,0,1), won=outcome===1;
    const delta=(won?amount:-amount) as Money;
    const changed=won?creditBalance(state.balances,command.actor.id,delta,'casino'):debitBalance(state.balances,command.actor.id,amount as Money,'casino');
    const balance=changed.balances[command.actor.id]!;
    return ok({...state,rng,balances:changed.balances,casino:null},[changed.event,{type:'CasinoResolved',payload:{playerId:command.actor.id,amount:amount as Money,won,balance}}]);
  }},
  DeclineCasino:{guard:targetGuard('turn',s=>s.turn?.turnId??null),allowedActors:['player'],allowedPhases:['playing'],handle(state,command,context){
    if(command.payload!==null)return fail('INVALID_PAYLOAD','DeclineCasino requires null');
    if(state.auction)return fail('AUCTION_IN_PROGRESS','Turn paused');
    if(command.actor.kind!=='player'||command.actor.id!==state.turn!.playerId)return fail('NOT_ACTIVE_PLAYER','Not your turn');
    if(context.now>=state.turn!.deadline)return fail('DEADLINE_PASSED','Turn expired');
    if(!state.casino||state.casino.playerId!==command.actor.id||state.casino.turnId!==state.turn!.turnId)return fail('NO_CASINO','No casino decision');
    return ok({...state,casino:null},[{type:'CasinoDeclined',payload:{playerId:command.actor.id,auto:false}}]);
  }},
  PayJailFee:{guard:targetGuard('turn',s=>s.turn?.turnId??null),allowedActors:['player'],allowedPhases:['playing'],handle(state,command,context){
    if(command.payload!==null)return fail('INVALID_PAYLOAD','PayJailFee requires null');
    if(state.auction)return fail('AUCTION_IN_PROGRESS','Turn paused');
    if(command.actor.kind!=='player'||command.actor.id!==state.turn!.playerId)return fail('NOT_ACTIVE_PLAYER','Not your turn');
    if(context.now>=state.turn!.deadline)return fail('DEADLINE_PASSED','Turn expired');
    if(!Object.hasOwn(state.jail,command.actor.id))return fail('NOT_IN_JAIL','Player is not in jail');
    if(state.turn!.rolled)return fail('ALREADY_ROLLED','Already rolled');
    const fee=jailFee(state.economy);
    if(state.balances[command.actor.id]!<fee)return fail('INSUFFICIENT_FUNDS','Insufficient cash for jail fee');
    const debit=debitBalance(state.balances,command.actor.id,fee,'jail-fee');
    const {[command.actor.id]:_entry,...jail}=state.jail;
    return ok({...state,balances:debit.balances,jail},[debit.event,{type:'JailReleased',payload:{playerId:command.actor.id,reason:'fee',fee}}]);
  }}
};

export function attemptJailRoll(state:GameState, dice:readonly [number,number], now:TransitionContext['now']) {
  const playerId=state.turn!.playerId, double=dice[0]===dice[1], attempt=state.jail[playerId]!.attemptsUsed+1;
  if(!double&&attempt<3) return {state:{...state,jail:{...state.jail,[playerId]:{attemptsUsed:attempt}},turn:{...state.turn!,rolled:true,doublesStreak:0,pendingBonus:false}},events:[{type:'JailAttemptFailed',payload:{playerId,attemptsUsed:attempt}}] as GameEvent[],closed:false,bankrupt:false};
  let next=state; const events:GameEvent[]=[]; const fee=jailFee(state.economy);
  if(!double){
    const settled=settleDebt(state,{payerId:playerId,creditor:{kind:'bank'},amount:fee,cause:{kind:'jail-fee'}},now);
    next=settled.state;events.push(...settled.events);
    if(settled.bankrupt)return {state:next,events,closed:true,bankrupt:true};
  }
  const {[playerId]:_entry,...jail}=next.jail; next={...next,jail,turn:{...next.turn!,rolled:true,doublesStreak:0,pendingBonus:false}};
  events.push({type:'JailReleased',payload:{playerId,reason:double?'double':'fee-forced',...(!double?{fee}:{})}});
  const moved=movePlayer(next,playerId,dice[0]+dice[1]);
  const landed=landOn(moved.state,playerId,dice[0]+dice[1]);
    return {state:landed.state,events:[...events,...moved.events,...landed.events],closed:!!landed.closed,bankrupt:false};
}
