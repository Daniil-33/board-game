import {describe,it,expect} from 'vitest';
import {createSession} from '../session.js';
import {gameEngine} from '../rules.js';
import {jailFee} from '../special-cells.js';
import {CLASSIC_40} from '../board.js';
import {cmd,ctx,pid,player} from './helpers/fixtures.js';
import {forceEntropy} from './helpers/dice.js';
import {playingGame,types,type Game} from './helpers/game.js';
import type {Money} from '../types.js';
import type {GameState} from '../state.js';

const JAIL=CLASSIC_40.jailCell;
function prisonerUp():Game {
  const g=playingGame(['a','b']);g.roll(1,1);g.endTurn();g.roll(2,2);g.endTurn();g.roll(3,3);g.roll(1,2);g.endTurn();return g;
}
function jailedState(g:Game,attemptsUsed:number,cash?:number):GameState{
  return {...g.state,jail:{a:{attemptsUsed}},...(cash===undefined?{}:{balances:{...g.state.balances,a:cash as Money}})};
}
function submit(state:ReturnType<typeof jailedState>,dice:readonly [number,number]){
  const session=createSession(gameEngine,state);
  return session.submit(cmd('RollDice',null,{actor:player('a'),target:{kind:'turn',id:state.turn!.turnId}}),ctx(undefined,forceEntropy(state.rng!,dice)));
}

describe('final jail rules',()=>{
  it('keeps the prisoner in turn order and names them in TurnStarted',()=>{
    const g=playingGame(['a','b']);g.roll(1,1);g.endTurn();g.roll(2,2);g.endTurn();g.roll(3,3);g.roll(1,2);
    const events=g.endTurn();
    expect(events.at(-1)).toMatchObject({type:'TurnStarted',payload:{playerId:'a',bonus:false}});
    expect(g.state.jail).toEqual({a:{attemptsUsed:0}});
  });

  it('releases on a double, moves and does not count the jail double or grant a bonus',()=>{
    const g=prisonerUp(),events=g.roll(2,2);
    expect(types(events)).toEqual(['DiceRolled','JailReleased','PlayerMoved','PurchaseOffered']);
    expect(events[1]!.payload).toEqual({playerId:'a',reason:'double'});
    expect(g.state.turn).toMatchObject({pendingBonus:false,doublesStreak:0});
    expect(g.state.jail).toEqual({});
    expect(g.endTurn().at(-1)!.payload).toMatchObject({playerId:'b',bonus:false});
  });

  it('keeps the prisoner on the first two failures and allows normal own-turn closure',()=>{
    const g=prisonerUp();
    const first=g.roll(1,2);
    expect(types(first)).toEqual(['DiceRolled','JailAttemptFailed']);
    expect(first[1]!.payload).toEqual({playerId:'a',attemptsUsed:1});
    expect(g.state.positions.a).toBe(JAIL);
    expect(g.state.turn).toMatchObject({rolled:true,doublesStreak:0,pendingBonus:false});
    g.endTurn();g.roll(1,2);g.endTurn();
    const second=g.roll(3,4);
    expect(second.at(-1)!.payload).toEqual({playerId:'a',attemptsUsed:2});
    expect(g.state.positions.a).toBe(JAIL);
  });

  it('settles the third-failure fee before movement',()=>{
    const g=prisonerUp(),state=jailedState(g,2),result=submit(state,[5,1]);
    expect(result.kind).toBe('accepted');
    if(result.kind==='accepted'){
      expect(types(result.events)).toEqual(['DiceRolled','BalanceChanged','JailReleased','PlayerMoved','PurchaseOffered']);
      expect(result.events[1]!.payload).toMatchObject({reason:'jail-fee',delta:-jailFee(state.economy)});
      expect(result.events[2]!.payload).toEqual({playerId:'a',reason:'fee-forced',fee:jailFee(state.economy)});
      expect(result.events[3]!.payload).toMatchObject({from:JAIL,to:JAIL+6});
    }
  });

  it('uses liquidation and closes bankrupt on a third failure without moving',()=>{
    const g=prisonerUp(),state=jailedState(g,2,0),result=submit(state,[1,2]);
    expect(result.kind).toBe('accepted');
    if(result.kind==='accepted'){
      expect(types(result.events)).toEqual(['DiceRolled','AssetsReleased','PlayerBankrupt','TurnEnded','GameEnded']);
      expect(result.events.some(e=>e.type==='PlayerMoved')).toBe(false);
      expect(result.events.find(e=>e.type==='TurnEnded')!.payload).toMatchObject({reason:'bankrupt'});
    }
  });

  it('liquidates owned assets to settle the forced fee before moving',()=>{
    const g=prisonerUp();
    const assets=[g.state.board!.cells[1]!.asset!,g.state.board!.cells[3]!.asset!,g.state.board!.cells[6]!.asset!];
    const state={...jailedState(g,2,0),owners:Object.fromEntries(assets.map(a=>[a.assetId,pid('a')]))};
    const result=submit(state,[1,2]);
    expect(result.kind).toBe('accepted');
    if(result.kind==='accepted'){
      const events=result.events;
      expect(events.map(e=>e.type)).toEqual(['DiceRolled','BalanceChanged','AssetMortgaged','BalanceChanged','AssetMortgaged','BalanceChanged','AssetMortgaged','LiquidationApplied','BalanceChanged','JailReleased','PlayerMoved','PurchaseOffered']);
      expect(events.findIndex(e=>e.type==='JailReleased')).toBeLessThan(events.findIndex(e=>e.type==='PlayerMoved'));
      expect(events.filter(e=>e.type==='BalanceChanged').at(-1)!.payload).toMatchObject({reason:'jail-fee',delta:-jailFee(state.economy)});
      expect(events.find(e=>e.type==='JailReleased')!.payload).toMatchObject({reason:'fee-forced',fee:jailFee(state.economy)});
    }
  });

  it('rejects voluntary fee below the fee and leaves the turn unchanged',()=>{
    const g=prisonerUp(),state=jailedState(g,0,0),session=createSession(gameEngine,state);
    const result=session.submit(cmd('PayJailFee',null,{actor:player('a'),target:{kind:'turn',id:state.turn!.turnId}}),ctx());
    expect(result.kind).toBe('rejected');
    if(result.kind==='rejected') expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(session.state).toBe(state);
  });

  it('checks PayJailFee guards in the approved order',()=>{
    const g=prisonerUp(),base=jailedState(g,0),turnId=base.turn!.turnId;
    const reject=(state:GameState,payload:unknown,actor='a',at=ctx().now,expectedCode:string)=>{
      const session=createSession(gameEngine,state);
      const result=session.submit(cmd('PayJailFee',payload,{actor:player(actor),target:{kind:'turn',id:turnId}}),ctx(at));
      expect(result.kind).toBe('rejected');
      if(result.kind==='rejected')expect(result.error.code).toBe(expectedCode);
      expect(session.state).toBe(state);
    };
    const asset=base.board!.cells[1]!.asset!;
    const auction={auctionId:'auc',assetId:asset.assetId,cell:1,price:10,startBid:10,step:10,reason:'choice',order:[pid('a'),pid('b')],passed:[],leader:null,leadingBid:null,bids:[],responder:pid('b'),responseId:'r',responseDeadline:base.turn!.deadline};
    reject({...base,auction:auction as never},{fee:10},'a',ctx().now,'INVALID_PAYLOAD');
    reject({...base,auction:auction as never},null,'a',ctx().now,'AUCTION_IN_PROGRESS');
    reject(base,null,'b',base.turn!.deadline,'NOT_ACTIVE_PLAYER');
    reject(base,null,'a',base.turn!.deadline,'DEADLINE_PASSED');
    reject({...base,jail:{}},null,'a',ctx().now,'NOT_IN_JAIL');
    reject({...base,turn:{...base.turn!,rolled:true}},null,'a',ctx().now,'ALREADY_ROLLED');
    reject(jailedState(g,0,0),null,'a',ctx().now,'INSUFFICIENT_FUNDS');
  });

  it('voluntary fee leaves the turn unrolled for a normal double',()=>{
    const g=prisonerUp(),state=g.state,session=createSession(gameEngine,state);
    const fee=session.submit(cmd('PayJailFee',null,{actor:player('a'),target:{kind:'turn',id:state.turn!.turnId}}),ctx());
    expect(fee.kind).toBe('accepted');
    expect(session.state.turn).toMatchObject({rolled:false,pendingBonus:false});
    const roll=session.submit(cmd('RollDice',null,{actor:player('a'),target:{kind:'turn',id:state.turn!.turnId}}),ctx(undefined,forceEntropy(session.state.rng!,[2,2])));
    expect(roll.kind).toBe('accepted');
    expect(session.state.turn).toMatchObject({rolled:true,pendingBonus:true,doublesStreak:1});
  });

  it('sends a non-third double that lands on cell 30 to jail and closes the turn',()=>{
    const g=playingGame(['a','b']),state={...g.state,positions:{...g.state.positions,a:28}};
    const session=createSession(gameEngine,state);
    const result=session.submit(cmd('RollDice',null,{actor:player('a'),target:{kind:'turn',id:state.turn!.turnId}}),ctx(undefined,forceEntropy(state.rng!,[1,1])));
    expect(result.kind).toBe('accepted');
    if(result.kind==='accepted'){
      expect(types(result.events)).toEqual(['DiceRolled','PlayerMoved','SentToJail','TurnEnded','TurnStarted']);
      expect(result.events[2]!.payload).toEqual({playerId:'a',from:30,to:JAIL});
      expect(result.state.jail).toEqual({a:{attemptsUsed:0}});
      expect(result.state.turn).toMatchObject({playerId:'b',pendingBonus:false,doublesStreak:0});
    }
  });

  it('timeout attempts a double and continues the same turn',()=>{
    const g=prisonerUp(),events=g.timeout({dice:[4,2]});
    expect(types(events)).toEqual(['DiceRolled','JailAttemptFailed','TurnContinued']);
    expect(g.state.turn).toMatchObject({playerId:'a',continuation:true,rolled:true,doublesStreak:0,pendingBonus:false});
  });

  it('timeout double release never grants a bonus and continues',()=>{
    const g=prisonerUp(),events=g.timeout({dice:[6,6]});
    expect(types(events)).toContain('JailReleased');
    expect(g.state.turn).toMatchObject({continuation:true,rolled:true,doublesStreak:0,pendingBonus:false});
    expect(g.state.jail).toEqual({});
  });

  it('does not carry a jail double into the following doubles streak',()=>{
    const g=prisonerUp();g.roll(2,2);g.endTurn();g.roll(1,2);g.endTurn();g.roll(1,1);g.endTurn();g.roll(5,5);
    expect(g.state.turn!.doublesStreak).toBe(2);
    expect(g.state.jail).toEqual({});
  });
});
