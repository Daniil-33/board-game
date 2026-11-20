import {describe,it,expect} from 'vitest';
import {createSession} from '../session.js';
import {gameEngine} from '../rules.js';
import {casinoCap,jailFee,landOn} from '../special-cells.js';
import {nextIntInclusive,seedRng} from '../rng.js';
import {cmd,ctx,pid,player} from './helpers/fixtures.js';
import {playingGame,types} from './helpers/game.js';
import type {GameState} from '../state.js';
import type {Money} from '../types.js';

function cardSeed(wanted:number):number {
  for(let seed=0;seed<100;seed++) if(nextIntInclusive(seedRng(seed),0,3)[0]===wanted)return seed;
  throw new Error('card seed not found');
}
function outcomeSeed(wanted:number):number {
  for(let seed=0;seed<100;seed++) if(nextIntInclusive(seedRng(seed),0,1)[0]===wanted)return seed;
  throw new Error('casino seed not found');
}
function landedAt(state:GameState,cell:number,rng=state.rng!) {
  const playerId=state.turn!.playerId;
  return landOn({...state,rng,positions:{...state.positions,[playerId]:cell},turn:{...state.turn!,rolled:true}},playerId,4);
}

describe('stage 6 special cells',()=>{
  it('derives the accepted casino caps and jail fees for every player count',()=>{
    const expected=[
      {players:2,capital:29910,lapReward:3980,cap:2990,fee:990},
      {players:3,capital:19940,lapReward:2650,cap:1990,fee:660},
      {players:4,capital:14950,lapReward:1990,cap:1490,fee:490},
      {players:5,capital:11960,lapReward:1590,cap:1190,fee:390},
      {players:6,capital:9970,lapReward:1320,cap:990,fee:330},
    ];
    for(const row of expected){
      const game=playingGame(Array.from({length:row.players},(_,i)=>`p${i}`));
      expect(game.state.economy).toEqual({startingCapital:row.capital,lapReward:row.lapReward});
      expect(casinoCap(game.state.economy)).toBe(row.cap);
      expect(jailFee(game.state.economy)).toBe(row.fee);
    }
  });

  it('opens casino, resolves either deterministic outcome, and clears the decision',()=>{
    for(const [draw,won] of [[0,false],[1,true]] as const){
      const base=playingGame(['a','b']).state;
      const open=landedAt(base,20,seedRng(outcomeSeed(draw)));
      expect(open.events).toEqual([{type:'CasinoOffered',payload:{playerId:'a',cap:casinoCap(base.economy)}}]);
      const session=createSession(gameEngine,open.state);
      const turnId=open.state.turn!.turnId;
      const result=session.submit(cmd('PlaceCasinoBet',{amount:10},{actor:player('a'),target:{kind:'turn',id:turnId}}),ctx());
      expect(result.kind).toBe('accepted');
      if(result.kind==='accepted'){
        expect(types(result.events)).toEqual(['BalanceChanged','CasinoResolved']);
        expect(result.events[1]!.payload).toMatchObject({playerId:'a',amount:10,won});
        expect(result.state.casino).toBeNull();
      }
    }
  });

  it('checks casino guards in order and preserves state and RNG on rejection',()=>{
    const base=playingGame(['a','b']).state,open=landedAt(base,20),turnId=open.state.turn!.turnId;
    const reject=(state:GameState,payload:unknown,actor='a',at=ctx().now,code:string)=>{
      const session=createSession(gameEngine,state);
      const result=session.submit(cmd('PlaceCasinoBet',payload,{actor:player(actor),target:{kind:'turn',id:turnId}}),ctx(at));
      expect(result.kind).toBe('rejected');
      if(result.kind==='rejected')expect(result.error.code).toBe(code);
      expect(session.state).toBe(state);
      expect(session.state.rng).toBe(state.rng);
    };
    reject(open.state,7,'a',ctx().now,'INVALID_PAYLOAD');
    const asset=base.board!.cells[1]!.asset!;
    const auction={auctionId:'auc',assetId:asset.assetId,cell:1,price:10 as Money,startBid:10 as Money,step:10 as Money,reason:'choice' as const,
      order:[pid('a'),pid('b')],passed:[],leader:null,leadingBid:null,bids:[],responder:pid('b'),responseId:'r',responseDeadline:base.turn!.deadline};
    reject({...open.state,auction},{amount:10},'b',open.state.turn!.deadline,'AUCTION_IN_PROGRESS');
    reject(open.state,{amount:10},'b',open.state.turn!.deadline,'NOT_ACTIVE_PLAYER');
    reject({...open.state,casino:null},{amount:10},'a',open.state.turn!.deadline,'DEADLINE_PASSED');
    reject({...open.state,casino:null},{amount:10},'a',ctx().now,'NO_CASINO');
    reject({...open.state,charge:{payerId:pid('a'),amount:10 as Money,cause:'chance'}}, {amount:0},'a',ctx().now,'PAYMENT_PENDING');
    reject(open.state,{amount:0},'a',ctx().now,'INVALID_BET');
    reject(open.state,{amount:15},'a',ctx().now,'INVALID_BET');
    reject(open.state,{amount:open.state.casino!.cap+10},'a',ctx().now,'INVALID_BET');
    reject({...open.state,balances:{...open.state.balances,a:0 as Money}},{amount:10},'a',ctx().now,'INVALID_BET');
  });

  it('accepts a maximum bet equal to cash when cash is below the cap',()=>{
    const base=playingGame(['a','b']).state;
    const opened=landedAt({...base,balances:{...base.balances,a:50 as Money}},20);
    const session=createSession(gameEngine,opened.state);
    const result=session.submit(cmd('PlaceCasinoBet',{amount:50},{actor:player('a'),target:{kind:'turn',id:opened.state.turn!.turnId}}),ctx());
    expect(opened.state.casino!.cap).toBeGreaterThan(50);
    expect(result.kind).toBe('accepted');
    if(result.kind==='accepted'){
      expect(types(result.events)).toEqual(['BalanceChanged','CasinoResolved']);
      expect(result.events[1]!.payload).toMatchObject({playerId:'a',amount:50,balance:100});
    }
  });

  it('supports manual decline and auto-declines before EndTurn or timeout closure',()=>{
    const base=playingGame(['a','b']).state,open=landedAt(base,20),turnId=open.state.turn!.turnId;
    const manual=createSession(gameEngine,open.state);
    const decline=manual.submit(cmd('DeclineCasino',null,{actor:player('a'),target:{kind:'turn',id:turnId}}),ctx());
    expect(decline.kind).toBe('accepted');
    if(decline.kind==='accepted')expect(decline.events).toEqual([{type:'CasinoDeclined',payload:{playerId:'a',auto:false}}]);
    expect(manual.state.casino).toBeNull();

    for(const type of ['EndTurn','Timeout'] as const){
      const session=createSession(gameEngine,open.state);
      const at=type==='Timeout'?open.state.turn!.deadline:ctx().now;
      const command=type==='EndTurn'
        ? cmd(type,null,{actor:player('a'),target:{kind:'turn',id:turnId}})
        : cmd(type,null,{target:{kind:'turn',id:turnId}});
      const close=session.submit(command,ctx(at));
      expect(close.kind).toBe('accepted');
      if(close.kind==='accepted'){
        expect(close.events[0]).toEqual({type:'CasinoDeclined',payload:{playerId:'a',auto:true}});
        expect(close.state.casino).toBeNull();
      }
    }
    const penniless={...base,balances:{...base.balances,a:0 as Money}};
    const noLegalBet=landedAt(penniless,20);
    expect(noLegalBet.events[0]!.type).toBe('CasinoOffered');
  });

  it('draws all four cards in order with quantized amounts and opens a bank charge for losses',()=>{
    const expected=['gain-5','loss-5','gain-10','loss-10'];
    const base=playingGame(['a','b']).state;
    for(let i=0;i<4;i++){
      const result=landedAt(base,2,seedRng(cardSeed(i)));
      const card=expected[i]!;
      const amount=(10*Math.floor(base.economy!.startingCapital*(i<2?5:10)/1000));
      expect(result.events).toEqual(i%2
        ? [{type:'ChanceDrawn',payload:{playerId:'a',card,amount}},{type:'ChargeDue',payload:{payerId:'a',amount,cause:'chance'}}]
        : [{type:'ChanceDrawn',payload:{playerId:'a',card,amount}},{type:'BalanceChanged',payload:{playerId:'a',delta:amount,balance:base.balances.a!+amount,reason:'chance'}}]);
      expect(result.state.charge).toEqual(i%2?{payerId:'a',amount,cause:'chance'}:null);
    }
  });

  it('leaves the jail visit cell inert when reached by movement',()=>{
    const base=playingGame(['a','b']).state;
    const result=landedAt(base,10);
    expect(result.events).toEqual([]);
    expect(result.state.jail).toEqual({});
  });
});
