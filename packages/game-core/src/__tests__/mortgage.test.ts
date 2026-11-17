import { describe, expect, it } from 'vitest';
import { gameEngine, checkInvariants, isMortgaged, mortgageAdvance, mortgageLegality, redeemLegality, buildLegality, saleLegality, rentFor, rentQuotes, projectState, projectEvents, createSession, restoreSession, pendingDeadlines, genesis, type GameState, type GameCommand, type AssetId, type Money } from '../index.js';
import { offerRent } from '../rent.js';
import { playingGame, T0 } from './helpers/game.js';
import { cmd, ctx, pid, player, deepFreeze } from './helpers/fixtures.js';
import { forceEntropy } from './helpers/dice.js';
const q = (n: number, d = 1) => 10 * Math.floor(n / (10*d));
const base = (ids = ['a','b','c']) => playingGame(ids).state;
function group(s: GameState, id = 'M2') { return s.board!.cells.filter(c => c.asset?.groupId === id).map(c => c.asset!); }
function portfolio(ids?: string[]): GameState { const s = base(ids); return {...s, owners: Object.fromEntries(group(s).map(a => [a.assetId, pid('a')]))}; }
function command(s: GameState, type: string, assetId?: AssetId, by = s.turn!.playerId): GameCommand {
  return cmd(type, assetId === undefined ? null : {assetId}, {actor:player(by), target:{kind:'turn',id:s.turn!.turnId}});
}
function accept(s: GameState, c: GameCommand, at = T0, dice?: number[]) {
  const r = gameEngine.execute(deepFreeze(s), c, ctx(at, dice ? forceEntropy(s.rng!, dice) : undefined));
  if (r.kind !== 'accepted') throw new Error(`${c.type}: ${r.error.code}`);
  checkInvariants(r.state); return r;
}
function reject(s: GameState, c: GameCommand, code: string, at = T0) {
  const before = JSON.stringify(s), r = gameEngine.execute(deepFreeze(s),c,ctx(at));
  expect(r.kind === 'rejected' && r.error.code).toBe(code);
  expect(r.state).toBe(s); expect(r.state.rng).toBe(s.rng); expect(JSON.stringify(s)).toBe(before);
}
function close(s: GameState, bonus = false) {
  const ready = {...s, purchase:null, rent:null, turn:{...s.turn!,rolled:true,pendingBonus:bonus,doublesStreak:bonus?1:0}};
  return accept(ready,command(ready,'EndTurn'));
}
function mortgage(s = portfolio()) { const id=group(s)[2]!.assetId; return {id, r:accept(s,command(s,'Mortgage',id))}; }

describe('core-7 mortgage commands',()=>{
  it('initializes state and rejects every earlier rules version',()=>{
    expect(genesis()).toMatchObject({mortgages:{},eliminations:[],finishedAt:null});
    for(let i=0;i<=6;i++) reject(genesis(),cmd('CreateGame',{seed:42,rulesVersion:`core-${i}`}),'UNSUPPORTED_RULES_VERSION');
  });
  it('credits quantized advance, preserves sibling houses, and redeems the stored advance',()=>{
    let s=portfolio(); const [a,b,c]=group(s);s={...s,houses:{[a!.assetId]:1,[b!.assetId]:1}};
    const r=accept(s,command(s,'Mortgage',c!.assetId)),amount=mortgageAdvance(c!.price);
    expect(r.state.mortgages[c!.assetId]).toEqual({advance:amount,lapsCompleted:0,pending:s.order});
    expect(r.state.houses).toEqual(s.houses);expect(r.state.balances.a).toBe(s.balances.a!+amount);
    expect(r.events).toEqual([{type:'BalanceChanged',payload:{playerId:'a',delta:amount,balance:s.balances.a!+amount,reason:'mortgage'}},{type:'AssetMortgaged',payload:{playerId:'a',assetId:c!.assetId,advance:amount,auto:false}}]);
    expect(buildLegality(r.state,pid('a'),c!.assetId)).toBe('GROUP_MORTGAGED');
    const redeemed=accept(r.state,command(r.state,'Redeem',c!.assetId));expect(redeemed.state.mortgages).toEqual({});expect(redeemed.state.balances).toEqual(s.balances);
    expect(redeemed.events[0]!.payload).toMatchObject({delta:-amount,reason:'redeem'});
    expect(redeemed.events[1]).toEqual({type:'AssetRedeemed',payload:{playerId:'a',assetId:c!.assetId,amount}});
    for(const cell of s.board!.cells) if(cell.asset) expect(mortgageAdvance(cell.asset.price)).toBe(q(cell.asset.price,2));
  });
  it('shares every legality code with handlers',()=>{
    const s=portfolio(), id=group(s)[0]!.assetId, mortgaged=accept(s,command(s,'Mortgage',id)).state;
    const cases:[GameState,string,AssetId,string][]=[
      [{...s,phase:'setup'},'Mortgage',id,'PHASE_NOT_ALLOWED'],
      [{...s,auction:{} as never},'Mortgage',id,'AUCTION_IN_PROGRESS'],
      [{...s,turn:{...s.turn!,playerId:pid('b')}},'Mortgage',id,'NOT_ACTIVE_PLAYER'],
      [{...s,purchase:{} as never},'Mortgage',id,'DECISION_PENDING'],
      [s,'Mortgage','unknown' as AssetId,'NOT_AN_ASSET'],[s,'Mortgage','__proto__' as AssetId,'NOT_AN_ASSET'],
      [{...s,owners:{}},'Mortgage',id,'NOT_OWNER'],[mortgaged,'Mortgage',id,'ALREADY_MORTGAGED'],
      [{...s,houses:{[id]:1}},'Mortgage',id,'HAS_HOUSES'],
      [{...s,purchase:{} as never,rent:{} as never},'Redeem',id,'DECISION_PENDING'],
      [{...s,rent:{} as never},'Redeem',id,'RENT_PENDING'],[s,'Redeem','unknown' as AssetId,'NOT_AN_ASSET'],
      [{...s,owners:{}},'Redeem',id,'NOT_OWNER'],[s,'Redeem',id,'NOT_MORTGAGED'],
      [{...mortgaged,balances:{...s.balances,a:0 as Money}},'Redeem',id,'INSUFFICIENT_FUNDS'],
    ];
    for(const [state,type,assetId,code] of cases){ expect((type==='Mortgage'?mortgageLegality:redeemLegality)(state,pid('a'),assetId)).toBe(code);reject(state,command(state,type,assetId,pid('a')),code); }
  });
  it('covers redemption legality, funds and restored rent eligibility',()=>{
    const s=portfolio(), id=group(s)[0]!.assetId;
    reject(s,command(s,'Redeem',id),'NOT_MORTGAGED');expect(redeemLegality(s,pid('a'),id)).toBe('NOT_MORTGAGED');
    const mortgaged=accept(s,command(s,'Mortgage',id)).state;
    const cases:[GameState,AssetId,string][]=[
      [{...mortgaged,purchase:{} as never},id,'DECISION_PENDING'],
      [{...mortgaged,rent:{} as never},id,'RENT_PENDING'],
      [mortgaged,'unknown' as AssetId,'NOT_AN_ASSET'],
      [{...mortgaged,owners:{[id]:pid('b')}},id,'NOT_OWNER'],
      [{...mortgaged,balances:{...mortgaged.balances,a:0 as Money}},id,'INSUFFICIENT_FUNDS'],
    ];
    for(const [state,assetId,code] of cases){expect(redeemLegality(state,pid('a'),assetId)).toBe(code);reject(state,command(state,'Redeem',assetId),code);}
    expect(rentFor(mortgaged,id,null)).toBe(0);
    const redeemed=accept(mortgaged,command(mortgaged,'Redeem',id)).state;
    expect(rentFor(redeemed,id,null)).toBe(rentFor(s,id,null));expect(rentFor(redeemed,id,null)).toBeGreaterThan(0);
  });
  it.each(['Mortgage','Redeem'])('%s respects payload, envelope, auction, actor and deadline precedence',type=>{
    const s=portfolio(),id=group(s)[0]!.assetId;
    for(const payload of [null,{},[],{assetId:1},{assetId:id,extra:1}]) reject(s,{...command(s,type,id),payload},'INVALID_PAYLOAD');
    reject(s,{...command(s,type,id),actor:{kind:'system'}},'ACTOR_NOT_ALLOWED');
    reject(s,command(s,type,id,pid('stranger')),'UNKNOWN_ACTOR');
    reject(s,{...command(s,type,id),expected:{kind:'revision',revision:s.revision}},'TARGET_MISMATCH');
    reject(s,{...command(s,type,id),expected:{kind:'target',target:{kind:'turn',id:'old'}}},'TARGET_MISMATCH');
    reject(s,command(s,type,id,pid('b')),'NOT_ACTIVE_PLAYER',s.turn!.deadline);
    reject(s,command(s,type,'unknown' as AssetId),'DEADLINE_PASSED',s.turn!.deadline);
    let auction=accept(s,command(s,'RollDice'),T0,[2,3]).state;
    auction=accept(auction,command(auction,'StartAuction')).state;
    reject(auction,command(auction,type,id,pid('b')),'AUCTION_IN_PROGRESS',s.turn!.deadline+100);
    reject(auction,{...command(auction,type,id),payload:{}},'INVALID_PAYLOAD');
  });
  it('allows mortgage and sale during fixed open rent, rejects redeem and build',()=>{
    let s=portfolio(); const [a,b,c]=group(s),cell=s.board!.cells[3]!;
    s=offerRent({...s,houses:{[a!.assetId]:1,[b!.assetId]:1},owners:{...s.owners,[cell.asset!.assetId]:pid('b')},positions:{...s.positions,a:3},turn:{...s.turn!,rolled:true}},3).state;
    const amount=s.rent!.amount; s=accept(s,command(s,'Mortgage',c!.assetId)).state;
    reject(s,command(s,'Redeem',c!.assetId),'RENT_PENDING');reject(s,command(s,'BuildHouse',c!.assetId),'RENT_PENDING');
    s=accept(s,command(s,'SellHouse',a!.assetId)).state;expect(s.rent!.amount).toBe(amount);
    expect(accept(s,command(s,'PayRent')).events.at(-1)!.payload).toMatchObject({amount,paid:amount,shortfall:0});
  });
});

describe('mortgaged rent tables',()=>{
  it('counts mortgaged siblings for regular doubling, but excludes logistics and energy holdings',()=>{
    let s=portfolio();const regular=group(s);s=accept(s,command(s,'Mortgage',regular[2]!.assetId)).state;
    expect(rentFor(s,regular[0]!.assetId,null)).toBe(2*q(regular[0]!.price,20));
    expect(rentFor(s,regular[2]!.assetId,null)).toBe(0);
    expect(isMortgaged(s,'toString' as AssetId)).toBe(false);
    for(const kind of ['logistics','energy']){
      const assets=group(s,kind);let all={...s,owners:{...s.owners,...Object.fromEntries(assets.map(a=>[a.assetId,pid('a')]))}};
      for(let n=assets.length;n>=1;n--){
        for(let dice=2;dice<=12;dice++) expect(rentFor(all,assets[0]!.assetId,dice)).toBe(kind==='logistics'?q(assets[0]!.price*[0,5,10,20,40][n]!,100):q(assets.reduce((v,a)=>v+a.price,0)*dice*n,200*assets.length));
        if(n>1)all=accept(all,command(all,'Mortgage',assets[n-1]!.assetId)).state;
      }
      all=accept(all,command(all,'Mortgage',assets[0]!.assetId)).state;
      for(const a of assets) {expect(rentFor(all,a.assetId,7)).toBe(0);expect(rentQuotes(all)[a.assetId]).toEqual({kind:'fixed',amount:0});}
      const landed={...all,turn:{...all.turn!,playerId:pid('b'),rolled:true},positions:{...all.positions,b:all.board!.cells.find(c=>c.asset?.assetId===assets[0]!.assetId)!.index}};
      expect(offerRent(landed,7).state.rent).toBeNull();
    }
  });
});

describe('collective laps and expiry',()=>{
  it.each([['a','b'],['a','b','c']])('expires exactly after eight collective laps with %j',(...ids)=>{
    let s=portfolio(ids),{id,r}=mortgage(s);s=r.state;const balance=s.balances;
    for(let lap=0;lap<8;lap++) for(let p=0;p<ids.length;p++){
      const r=close(s);s=r.state;
      if(lap===7&&p===ids.length-1){expect(r.events.map(e=>e.type)).toEqual(['TurnEnded','MortgageExpired','TurnStarted']);expect(s.owners[id]).toBeUndefined();}
      else {expect(s.mortgages[id]!.lapsCompleted).toBe(lap+(p===ids.length-1?1:0));expect(s.owners[id]).toBe('a');}
    }
    expect(s.mortgages).toEqual({});expect(s.balances).toEqual(balance);
  });
  it('counts the taking turn mid-lap, ignores an already counted bonus, and counts jail turns',()=>{
    let s=portfolio();s=close(s).state;s={...s,owners:Object.fromEntries(group(s).map(a=>[a.assetId,pid('b')]))};
    const {id,r}=mortgage(s);s=r.state;expect(s.turn!.playerId).toBe('b');
    s=close(s,true).state;expect(s.mortgages[id]!.pending).toEqual(['a','c']);
    s=close(s).state;expect(s.mortgages[id]!.pending).toEqual(['a','c']);
    s={...s,jail:{c:{attemptsUsed:0}},positions:{...s.positions,c:10}};
    s=accept(s,command(s,'RollDice'),T0,[1,2]).state;s=close(s).state;expect(s.mortgages[id]!.pending).toEqual(['a']);
    s=close(s).state;expect(s.mortgages[id]).toMatchObject({lapsCompleted:1,pending:['a','b','c']});
  });
  it('counts sent-to-jail closure and expires multiple assets in board order',()=>{
    let s=portfolio(); const assets=group(s);
    for(const a of [...assets].reverse())s=accept(s,command(s,'Mortgage',a.assetId)).state;
    s={...s,mortgages:Object.fromEntries(Object.entries(s.mortgages).map(([id,t])=>[id,{...t,lapsCompleted:7,pending:[pid('a')]}])),turn:{...s.turn!,doublesStreak:2}};
    const r=accept(s,command(s,'RollDice'),T0,[2,2]);expect(r.events.map(e=>e.type)).toEqual(['DiceRolled','SentToJail','TurnEnded',...assets.map(()=> 'MortgageExpired'),'TurnStarted']);
    expect(r.events.filter(e=>e.type==='MortgageExpired').map(e=>(e.payload as {assetId:AssetId}).assetId)).toEqual(assets.map(a=>a.assetId));
  });
  it('preserves [1,1,0] sibling houses, rent and sales after expiry',()=>{
    let s=portfolio();const [a,b,c]=group(s);s={...s,houses:{[a!.assetId]:1,[b!.assetId]:1}};
    s=accept(s,command(s,'Mortgage',c!.assetId)).state;
    for(let i=0;i<24;i++)s=close(s).state;
    expect(s.houses).toEqual({[a!.assetId]:1,[b!.assetId]:1});expect(rentFor(s,a!.assetId,null)).toBe(q(a!.price*15,100));
    expect(buildLegality(s,pid('a'),a!.assetId)).toBe('GROUP_INCOMPLETE');expect(saleLegality(s,pid('a'),a!.assetId)).toBeNull();
    expect(accept(s,command(s,'SellHouse',a!.assetId)).state.houses).toEqual({[b!.assetId]:1});
  });
});

it('validates mortgage terms, elimination records and finish times',()=>{
  const {id,r}=mortgage(),s=r.state,t=s.mortgages[id]!;
  for(const term of [{...t,advance:10},{...t,lapsCompleted:-1},{...t,lapsCompleted:8},{...t,lapsCompleted:0.5},{...t,pending:[pid('a'),pid('a')]},{...t,pending:[pid('absent')]}])expect(()=>checkInvariants({...s,mortgages:{[id]:term}} as GameState)).toThrow();
  expect(()=>checkInvariants({...s,houses:{[id]:1}})).toThrow();expect(()=>checkInvariants({...s,owners:{}})).toThrow();
  for(const patch of [{eliminations:[{playerId:pid('a'),reason:'resigned',at:T0,creditorId:null}]},{finishedAt:T0}])expect(()=>checkInvariants({...s,...patch} as GameState)).toThrow();
  const finished=accept(s,cmd('Resign',null,{actor:player('b'),rev:s.revision})).state;
  const end=accept(finished,cmd('Resign',null,{actor:player('c'),rev:finished.revision})).state;
  for(const patch of [{finishedAt:null},{finishedAt:-1},{eliminations:end.eliminations.map(e=>({...e,at:-1}))},{eliminations:end.eliminations.map(e=>({...e,creditorId:pid('a')}))}]) expect(()=>checkInvariants({...end,...patch} as GameState)).toThrow();
});

describe('resignation, projection and restoration',()=>{
  it('releases houses and mortgages in board order without changing balances',()=>{
    let s=portfolio();const [a,b,c]=group(s);s={...s,houses:{[a!.assetId]:1,[b!.assetId]:1}};
    s=accept(s,command(s,'Mortgage',c!.assetId)).state;
    const r=accept(s,cmd('Resign',null,{actor:player('a'),rev:s.revision}),T0+100);
    expect(r.state.balances).toEqual(s.balances);expect(r.state.owners).toEqual({});expect(r.state.houses).toEqual({});expect(r.state.mortgages).toEqual({});
    expect(r.events.map(e=>e.type)).toEqual(['PlayerResigned','AssetsReleased','TurnEnded','TurnStarted']);
    expect(r.events[1]).toEqual({type:'AssetsReleased',payload:{playerId:'a',assetIds:[a!.assetId,b!.assetId,c!.assetId],reason:'resigned'}});
    expect(r.state.eliminations).toEqual([{playerId:'a',reason:'resigned',at:T0+100,creditorId:null}]);
  });
  it('removes pending immediately but waits for a boundary when another player resigns',()=>{
    const m=mortgage();let s=m.r.state;
    s={...s,mortgages:{[m.id]:{...s.mortgages[m.id]!,lapsCompleted:7,pending:[pid('b')]}}};
    const r=accept(s,cmd('Resign',null,{actor:player('b'),rev:s.revision}));s=r.state;
    expect(s.mortgages[m.id]!.pending).toEqual([]);expect(r.events.map(e=>e.type)).toEqual(['PlayerResigned']);
    expect(close(s).events.map(e=>e.type)).toEqual(['TurnEnded','MortgageExpired','TurnStarted']);
  });
  it('defers an empty pending lap through an auction until resigned turn closure',()=>{
    let s=portfolio();const asset=group(s)[0]!;
    s={...s,owners:{[asset.assetId]:pid('b')}};
    s=accept(s,command(s,'RollDice'),T0,[2,3]).state;
    s=accept(s,command(s,'StartAuction')).state;
    s={...s,mortgages:{[asset.assetId]:{advance:mortgageAdvance(asset.price),lapsCompleted:7,pending:[pid('a')]}}};
    checkInvariants(s);
    const r=accept(s,cmd('Resign',null,{actor:player('a'),rev:s.revision}));s=r.state;
    expect(s.auction).not.toBeNull();expect(s.mortgages[asset.assetId]!.pending).toEqual([]);expect(r.events.some(e=>e.type==='MortgageExpired')).toBe(false);
    let events: readonly {type:string}[]=[];
    while(s.auction){const a=s.auction;const r=accept(s,cmd('PassAuction',null,{actor:player(a.responder),target:{kind:'auctionResponse',id:a.responseId}}));s=r.state;events=r.events;}
    expect(events.map(e=>e.type).slice(-3)).toEqual(['TurnEnded','MortgageExpired','TurnStarted']);expect(s.turn!.playerId).toBe('b');
  });
  it('skips terminal lap processing and exposes detached results to every viewer',()=>{
    const m=mortgage(portfolio(['a','b']));let s=m.r.state;
    s={...s,mortgages:{[m.id]:{...s.mortgages[m.id]!,lapsCompleted:7,pending:[pid('b')]}}};
    const r=accept(s,cmd('Resign',null,{actor:player('b'),rev:s.revision}),T0+123);
    expect(r.state.mortgages[m.id]).toMatchObject({lapsCompleted:7,pending:[]});expect(r.events.some(e=>e.type==='MortgageExpired')).toBe(false);
    expect(r.state.finishedAt).toBe(T0+123);expect(pendingDeadlines(r.state)).toEqual([]);
    expect(r.events.at(-1)).toEqual({type:'GameEnded',payload:{winner:'a',at:T0+123,eliminations:r.state.eliminations,finalBalances:s.balances}});
    for(const viewer of [{kind:'spectator'} as const,{kind:'player',id:pid('a')} as const,{kind:'player',id:pid('b')} as const]){
      const view=projectState(r.state,viewer);
      expect(view.result).toEqual({winner:'a',finishedAt:T0+123,eliminations:r.state.eliminations,finalBalances:r.state.balances});
      expect(view.mortgages[m.id]).toMatchObject({remainingLaps:1,pending:[]});expect(view).not.toHaveProperty('rng');
      expect(projectEvents(r.events,viewer)).toEqual(r.events);
      (view.mortgages[m.id]!.pending as unknown as string[]).push('mutation');
      (view.result!.eliminations[0] as {at:number}).at=0;expect(r.state.eliminations[0]!.at).toBe(T0+123);expect(r.state.mortgages[m.id]!.pending).toEqual([]);
    }
  });
  it('replays seeded commands through redemption, eight laps, resignation and a mid-term snapshot',()=>{
    const initial=portfolio(),id=group(initial)[0]!.assetId,session=createSession(gameEngine,initial);
    const submit=(type:string,assetId?:AssetId,dice?:number[])=>{
      const s=session.state; const c=command(s,type,assetId);
      const r=session.submit(c,ctx(T0,dice?forceEntropy(s.rng!,dice):undefined));
      if(r.kind!=='accepted')throw new Error(`${type}: ${r.error.code}`);return r.events;
    };
    submit('Mortgage',id);submit('Redeem',id);submit('Mortgage',id);
    const snapshot=session.state,prefix=session.log.length;
    expect(projectState(snapshot,{kind:'spectator'}).result).toBeNull();
    const deadline=pendingDeadlines(snapshot);
    expect(pendingDeadlines(restoreSession(gameEngine,snapshot,[]).state)).toEqual(deadline);
    let closures=0;
    // Every forced roll is non-double; purchase is resolved before closure.
    while(session.state.mortgages[id]){
      submit('RollDice',undefined,[1,2]);
      if(session.state.purchase)submit('BuyAsset');
      submit('EndTurn');closures++;
      expect(closures).toBeLessThanOrEqual(24);
    }
    expect(closures).toBe(24);expect(session.log.flatMap(e=>e.events).filter(e=>e.type==='MortgageExpired')).toHaveLength(1);
    for(const by of ['c','b'])expect(session.submit(cmd('Resign',null,{actor:player(by),rev:session.state.revision}),ctx()).kind).toBe('accepted');
    const restored=restoreSession(gameEngine,snapshot,session.log.slice(prefix));
    expect(restored.state).toEqual(session.state);expect(restored.log).toEqual(session.log.slice(prefix));
    expect(restoreSession(gameEngine,initial,session.log).state).toEqual(session.state);
    expect(projectState(restored.state,{kind:'spectator'})).toEqual(projectState(session.state,{kind:'spectator'}));
    expect(pendingDeadlines(restored.state)).toEqual(pendingDeadlines(session.state));
  });
});
