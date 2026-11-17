import { describe, expect, it } from 'vitest';
import { rentFor, energyRentFor, rentQuotes, buildLegality, saleLegality, houseCost, houseRefund, gameEngine, createSession, restoreSession, replay, pendingDeadlines, checkInvariants, projectState, projectEvents, type GameState, type AssetId, type Money, type GameCommand } from '../index.js';
import { offerRent } from '../rent.js';
import { playingGame } from './helpers/game.js';
import { cmd, ctx, pid, player, deepFreeze } from './helpers/fixtures.js';
import { forceEntropy } from './helpers/dice.js';
const q = (n: number, d = 1) => 10 * Math.floor(n / (10*d));
function base() { return playingGame(['a','b','c']).state; }
function command(s: GameState, type: string, payload: unknown = null, by = s.turn!.playerId) {
  return cmd(type, payload, {actor: player(by), target: {kind:'turn',id:s.turn!.turnId}});
}
function accept(s: GameState, c: GameCommand, at = 1_767_225_600_000, dice?: number[]) {
  const r = gameEngine.execute(deepFreeze(s), c, ctx(at, dice ? forceEntropy(s.rng!,dice) : undefined));
  if (r.kind !== 'accepted') throw new Error(`${c.type}: ${r.error.code}`);
  checkInvariants(r.state); return r;
}
function reject(s: GameState, c: GameCommand, code: string, at?: number) {
  const r = gameEngine.execute(deepFreeze(s), c, ctx(at));
  expect(r.kind === 'rejected' && r.error.code).toBe(code);
  expect(r.state).toBe(s); expect(r.state.rng).toBe(s.rng);
}
function group(s: GameState, size = 2) {
  return s.board!.cells.filter(c => c.kind === 'monopoly' && c.asset!.groupId === (size === 2 ? 'M1' : 'M2')).map(c=>c.asset!);
}
function owned(size = 2): GameState {
  const s = base(); return {...s, owners: Object.fromEntries(group(s,size).map(a=>[a.assetId,pid('a')]))};
}
function due(): GameState {
  const s = base(), cell = s.board!.cells[3]!;
  return offerRent({...s, owners:{[cell.asset!.assetId]:pid('b')}, positions:{...s.positions,a:3},turn:{...s.turn!,rolled:true}},3).state;
}
describe('rent formula tables across prices-1', () => {
  it('regular: every price, 0..4 houses, complete and incomplete groups', () => {
    const s = base();
    for (const c of s.board!.cells.filter(c=>c.kind==='monopoly')) {
      const a=c.asset!, members=s.board!.cells.filter(x=>x.asset?.groupId===a.groupId);
      for (const complete of [false,true]) for (let h=0;h<=4;h++) {
        const state={...s, owners:Object.fromEntries((complete?members:[c]).map(x=>[x.asset!.assetId,pid('b')])),houses:{[a.assetId]:h}};
        expect(rentFor(state,a.assetId,null)).toBe(q(a.price*[5,15,35,65,100][h]!,100)*(h===0&&complete?2:1));
      }
    }
  });
  it('logistics: every landed price, 1..4 holdings', () => {
    const s=base(), cells=s.board!.cells.filter(c=>c.kind==='logistics');
    for (const c of cells) for(let n=1;n<=4;n++) {
      const holdings=[c,...cells.filter(x=>x!==c)].slice(0,n);
      expect(rentFor({...s,owners:Object.fromEntries(holdings.map(x=>[x.asset!.assetId,pid('b')]))},c.asset!.assetId,null)).toBe(q(c.asset!.price*[0,5,10,20,40][n]!,100));
    }
  });
  it('energy: both prices, 1..2 holdings, dice 2..12, shared quote', () => {
    const s=base(), cells=s.board!.cells.filter(c=>c.kind==='energy');
    for(const c of cells) for(let n=1;n<=2;n++) for(let dice=2;dice<=12;dice++) {
      const state={...s,owners:Object.fromEntries([c,...cells.filter(x=>x!==c)].slice(0,n).map(x=>[x.asset!.assetId,pid('b')]))};
      const quote=rentQuotes(state)[c.asset!.assetId]!;
      expect(quote.kind).toBe('energy');
      const expected=q(cells.reduce((v,x)=>v+x.asset!.price,0)*dice*n,400);
      expect(rentFor(state,c.asset!.assetId,dice)).toBe(expected);
      if(quote.kind==='energy') expect(energyRentFor(quote,dice)).toBe(expected);
    }
  });
});
describe('settlement and movement',()=>{
  it('pays full rent from cash',()=>{
    const s=due(), amount=s.rent!.amount;
    const r=accept(s,command(s,'PayRent'));
    expect(r.state.rent).toBeNull();
    expect(r.events.map(e=>e.type)).toEqual(['BalanceChanged','BalanceChanged','RentPaid']);
    expect(r.events.at(-1)!.payload).toEqual({payerId:pid('a'),ownerId:pid('b'),assetId:s.rent!.assetId,amount,auto:false});
  });
  it.each(['EndTurn','Timeout'])('automatically settles %s before closure',type=>{
    const s=due(); const c=type==='Timeout'?cmd(type,null,{target:{kind:'turn',id:s.turn!.turnId}}):command(s,type);
    const r=accept(s,c,type==='Timeout'?s.turn!.deadline:undefined);
    expect(r.events.map(e=>e.type).indexOf('RentPaid')).toBeLessThan(r.events.map(e=>e.type).indexOf('TurnEnded'));
    expect(r.events.find(e=>e.type==='RentPaid')!.payload).toMatchObject({auto:true});
  });
  it('validates PayRent envelope and conditions without mutation',()=>{
    const s=due();reject(s,command(s,'PayRent',{}),'INVALID_PAYLOAD');reject(s,command(s,'PayRent',null,pid('b')),'NOT_ACTIVE_PLAYER');
    reject(s,command(s,'PayRent'),'DEADLINE_PASSED',s.turn!.deadline);
    reject(s,{...command(s,'PayRent'),expected:{kind:'target',target:{kind:'turn',id:'old'}}},'TARGET_MISMATCH');
    const no={...s,rent:null};reject(no,command(no,'PayRent'),'NO_RENT');
  });
  it('opens only for another active owner, after actual movement including release',()=>{
    const initial=base(), cell=initial.board!.cells[12]!;
    for(const owner of ['a','b']) {
      const s={...initial,owners:{[cell.asset!.assetId]:pid(owner)},positions:{...initial.positions,a:10},jail:{a:{attemptsUsed:0}}};
      const r=accept(s,command(s,'RollDice'),undefined,[1,1]);
      expect(r.state.rent!==null).toBe(owner==='b');
    }
    const s=due();const failed={...s,rent:null,positions:{...s.positions,a:10},jail:{a:{attemptsUsed:0}},turn:{...s.turn!,rolled:false},owners:s.owners};
    expect(accept(failed,command(failed,'RollDice'),undefined,[1,2]).state.rent).toBeNull();

    expect(rentFor(base(),'unknown' as AssetId,3)).toBe(0);
  });
  it.each(['a','b','c'])('isolates resignation %s',by=>{
    const s=due(),r=accept(s,cmd('Resign',null,{actor:player(by),rev:s.revision}));
    expect(r.state.balances).toEqual(s.balances); expect(r.state.rent).toEqual(by==='c'?s.rent:null);
    expect(r.events.some(e=>e.type==='RentPaid')).toBe(false);
  });
});
describe('houses and legality',()=>{
  it.each([2,3])('builds and sells evenly in %i asset group with one per-turn quota',size=>{
    let s=owned(size); const assets=group(s,size);
    const first=assets[0]!,id=first.assetId;
    const built=accept(s,command(s,'BuildHouse',{assetId:id}));s=built.state;
    expect(s.balances.a).toBe(base().balances.a!-q(first.price,2));expect(s.turn!.quotas.builds).toBe(0);
    expect(buildLegality(s,pid('a'),id)).toBe('UNEVEN_BUILD');
    expect(buildLegality(s,pid('a'),assets[1]!.assetId)).toBe('BUILD_QUOTA_USED');
    expect(saleLegality(s,pid('a'),assets[1]!.assetId)).toBe('NO_HOUSES');
    s=accept(s,command(s,'SellHouse',{assetId:id})).state;
    expect(s.houses).toEqual({});expect(s.turn!.quotas.builds).toBe(0);
    expect(s.balances.a).toBe(base().balances.a!-q(first.price,2)+q(q(first.price,2),2));
  });
  it('covers legality failures and handler agreement',()=>{
    const s=owned(),id=group(s)[0]!.assetId,other=group(s)[1]!.assetId;
    const cases: [GameState,AssetId,string][]=[
      [{...s,phase:'setup'},id,'PHASE_NOT_ALLOWED'],
      [{...s,turn:{...s.turn!,playerId:pid('b')}},id,'NOT_ACTIVE_PLAYER'],
      [{...s,purchase:{} as never},id,'DECISION_PENDING'],[{...s,auction:{} as never},id,'AUCTION_IN_PROGRESS'],
      [{...s,rent:{} as never},id,'RENT_PENDING'],[s,'unknown' as AssetId,'NOT_A_BUILDABLE_ASSET'],
      [{...s,owners:{}},id,'NOT_OWNER'],[{...s,owners:{[id]:pid('a')}},id,'GROUP_INCOMPLETE'],
      [{...s,houses:{[id]:4,[other]:4}},id,'MAX_HOUSES'],[{...s,houses:{[id]:1}},id,'UNEVEN_BUILD'],
      [{...s,turn:{...s.turn!,quotas:{builds:0,offers:2}}},id,'BUILD_QUOTA_USED'],[{...s,balances:{...s.balances,a:0 as Money}},id,'INSUFFICIENT_FUNDS'],
    ];
    for(const [state,assetId,code] of cases){expect(buildLegality(state,pid('a'),assetId)).toBe(code);reject(state,command(state,'BuildHouse',{assetId},pid('a')),code);}
    const uneven={...s,houses:{[id]:1,[other]:2}};expect(saleLegality(uneven,pid('a'),id)).toBe('UNEVEN_SALE');reject(uneven,command(uneven,'SellHouse',{assetId:id}),'UNEVEN_SALE');
    for(const type of ['BuildHouse','SellHouse']) for(const payload of [null,{},[],{assetId:id,extra:1},{assetId:1}]) reject(s,command(s,type,payload),'INVALID_PAYLOAD');
  });
  it.each([0,1])('a bonus turn resets the build quota from %i and so does the next turn',builds=>{
    const initial=owned(),s={...initial,turn:{...initial.turn!,rolled:true,pendingBonus:true,doublesStreak:1,quotas:{builds,offers:0}}};
    const bonus=accept(s,command(s,'EndTurn')).state;expect(bonus.turn!.bonus).toBe(true);expect(bonus.turn!.quotas).toEqual({builds:1,offers:2});
    const next={...bonus,turn:{...bonus.turn!,rolled:true,pendingBonus:false}};
    expect(accept(next,command(next,'EndTurn')).state.turn!.quotas.builds).toBe(1);
  });
  it('builds one house in the regular turn and another in its bonus turn',()=>{
    let s=owned();const [first,second]=group(s);
    s=accept(s,command(s,'BuildHouse',{assetId:first!.assetId})).state;
    expect(s.turn!.quotas.builds).toBe(0);expect(buildLegality(s,pid('a'),second!.assetId)).toBe('BUILD_QUOTA_USED');
    s={...s,turn:{...s.turn!,rolled:true,pendingBonus:true,doublesStreak:1}};
    s=accept(s,command(s,'EndTurn')).state;
    expect(s.turn).toMatchObject({playerId:'a',bonus:true,quotas:{builds:1,offers:2}});
    const built=accept(s,command(s,'BuildHouse',{assetId:second!.assetId}));
    expect(built.state.houses).toEqual({[first!.assetId]:1,[second!.assetId]:1});expect(built.state.turn!.quotas.builds).toBe(0);
    expect(built.events.map(e=>e.type)).toEqual(['BalanceChanged','HouseBuilt']);
  });
  it('selling never replenishes the build quota, in a regular or a bonus turn',()=>{
    for(const bonus of [false,true]){
      let s=owned();const [first,second]=group(s);
      s={...s,houses:{[first!.assetId]:1,[second!.assetId]:1},turn:{...s.turn!,bonus}};
      s=accept(s,command(s,'BuildHouse',{assetId:first!.assetId})).state;expect(s.turn!.quotas.builds).toBe(0);
      s=accept(s,command(s,'SellHouse',{assetId:first!.assetId})).state;
      expect(s.turn!.quotas.builds).toBe(0);expect(buildLegality(s,pid('a'),first!.assetId)).toBe('BUILD_QUOTA_USED');
    }
  });
});
describe('projection, invariants and restore',()=>{
  it('projects detached rent, houses and derived quotes to everyone and events in order',()=>{
    const s=due(),a=projectState(s,{kind:'spectator'}),b=projectState(s,{kind:'player',id:pid('a')});expect(a).toEqual(b);
    (a.rent as {amount:number}).amount=10;expect(s.rent!.amount).not.toBe(10);
    const events=accept(s,command(s,'PayRent')).events;expect(projectEvents(events,{kind:'spectator'})).toEqual(events);
  });
  it('rejects invalid houses, ownership, evenness, quotas and rent',()=>{
    const s=owned(),ids=group(s).map(a=>a.assetId);
    for(const houses of [{unknown:1},{[ids[0]!]:0},{[ids[0]!]:5},{[ids[0]!]:1.5},{[ids[0]!]:2}]) expect(()=>checkInvariants({...s,houses})).toThrow();
    expect(()=>checkInvariants({...s,owners:{},houses:{[ids[0]!]:1}})).toThrow();
    for(const builds of [-1,2,0.5]) expect(()=>checkInvariants({...s,turn:{...s.turn!,quotas:{builds,offers:2}}})).toThrow();
    const d=due();for(const rent of [{...d.rent!,amount:0 as Money},{...d.rent!,payerId:pid('b')},{...d.rent!,diceSum:3}]) expect(()=>checkInvariants({...d,rent})).toThrow();
    expect(()=>checkInvariants({...d,purchase:{} as never})).toThrow();
  });
  it('replays build/sell/rent and restores an open settlement with its exact deadline',()=>{
    const ownedState=owned(),energy=ownedState.board!.cells[12]!.asset!;
    const initial={...ownedState,owners:{...ownedState.owners,[energy.assetId]:pid('b')},positions:{...ownedState.positions,a:9}};
    const session=createSession(gameEngine,initial),id=group(initial)[0]!.assetId;
    for(const type of ['BuildHouse','SellHouse']) expect(session.submit(command(session.state,type,{assetId:id}),ctx()).kind).toBe('accepted');
    const beforeRoll=session.state;
    expect(session.submit(command(beforeRoll,'RollDice'),ctx(undefined,forceEntropy(beforeRoll.rng!,[1,2]))).kind).toBe('accepted');
    const open=session.state;expect(open.rent).not.toBeNull();
    const prefix=session.log.length;
    expect(session.submit(command(open,'PayRent'),ctx()).kind).toBe('accepted');
    const restored=restoreSession(gameEngine,open,session.log.slice(prefix));
    expect(restored.state).toEqual(session.state);
    expect(restoreSession(gameEngine,initial,session.log).state).toEqual(session.state);
    expect(pendingDeadlines(restoreSession(gameEngine,open,[]).state)).toEqual(pendingDeadlines(open));
    expect(restored.log).toEqual(session.log.slice(prefix));
  });
});

it('retains the shared seed-6689 Compose setup tie and three-double jail stream', async()=>{
  const { entropy }=await import('../types.js');
  let wordState=6689;
  const word=()=>{wordState=(wordState+0x9e3779b9)>>>0;let z=wordState;z=Math.imul(z^(z>>>16),0x85ebca6b);z=Math.imul(z^(z>>>13),0xc2b2ae35);return(z^(z>>>16))>>>0;};
  const session=createSession(gameEngine);
  const submit=(type:string,payload:unknown=null)=>{
    const s=session.state;
    const setup=s.setup;
    const c=setup?cmd(type,payload,{actor:player(setup.playerId),target:{kind:'setupRoll',id:setup.setupRollId}}):s.turn?command(s,type,payload):cmd(type,payload,{rev:s.revision});
    const r=session.submit(c,ctx(undefined,entropy([word(),word(),word(),word()])));
    if(r.kind!=='accepted')throw new Error(r.error.code);return r.events;
  };
  submit('CreateGame',{seed:6689,rulesVersion:'core-7'});submit('AddPlayer',{playerId:'a'});submit('AddPlayer',{playerId:'b'});submit('StartGame');
  let rolls=0;while(session.state.setup){submit('RollForOrder');rolls++;}expect(rolls).toBe(4);
  for(const dice of [[1,1],[4,4],[6,6]]){
    const events=submit('RollDice');expect(events[0]!.payload).toMatchObject({dice});
    if(dice[0]!==6)submit('EndTurn');else expect(events.map(e=>e.type)).toEqual(['DiceRolled','SentToJail','TurnEnded','TurnStarted']);
  }
});

it.each(['a','b'])('two-player resignation by %s drops rent before terminal closure',by=>{
  const g=playingGame(['a','b']),s0=g.state,cell=s0.board!.cells[3]!;
  const s=offerRent({...s0,owners:{[cell.asset!.assetId]:pid('b')},positions:{...s0.positions,a:3},turn:{...s0.turn!,rolled:true}},3).state;
  const r=accept(s,cmd('Resign',null,{actor:player(by),rev:s.revision}));
  expect(r.state.phase).toBe('finished');expect(r.state.rent).toBeNull();expect(r.state.balances).toEqual(s.balances);expect(r.events.some(e=>e.type==='RentPaid')).toBe(false);
});
it('blocks construction on rent, respects guard and deadline, and emits public house events',()=>{
  const s=owned(),id=group(s)[0]!.assetId;
  for(const type of ['BuildHouse','SellHouse']){
    const pending={...s,rent:due().rent};reject(pending,command(pending,type,{assetId:id}),type==='BuildHouse'?'RENT_PENDING':'NO_HOUSES');
    reject(s,{...command(s,type,{assetId:id}),expected:{kind:'target',target:{kind:'turn',id:'stale'}}},'TARGET_MISMATCH');
  }
  reject(s,command(s,'BuildHouse',{assetId:id}),'DEADLINE_PASSED',s.turn!.deadline);
  const built=accept(s,command(s,'BuildHouse',{assetId:id}));
  expect(projectEvents(built.events,{kind:'player',id:pid('c')})).toEqual(built.events);
  const sold=accept(built.state,command(built.state,'SellHouse',{assetId:id}));
  expect(projectEvents(sold.events,{kind:'spectator'})).toEqual(sold.events);
  const nohouses={...s,houses:{}};reject(nohouses,command(nohouses,'SellHouse',{assetId:id}),'NO_HOUSES');
});

it('keeps consumed quota through timeout continuation and resets it for each bonus turn, also after auction closure',()=>{
  let s=owned(),id=group(s)[0]!.assetId,other=group(s)[1]!.assetId;
  s=accept(s,command(s,'BuildHouse',{assetId:id})).state;
  const timeout=cmd('Timeout',null,{target:{kind:'turn',id:s.turn!.turnId}});
  s=accept(s,timeout,s.turn!.deadline,[2,2]).state;
  expect(s.turn!.continuation).toBe(true);expect(s.turn!.quotas.builds).toBe(0);
  s=accept(s,cmd('Timeout',null,{target:{kind:'turn',id:s.turn!.turnId}}),s.turn!.deadline).state;
  expect(s.turn!.bonus).toBe(true);expect(s.turn!.quotas.builds).toBe(1);
  s=accept(s,command(s,'BuildHouse',{assetId:other})).state;expect(s.turn!.quotas.builds).toBe(0);
  // The bonus roll lands on free cell 8, opening the existing auction path.
  const now=s.turn!.deadline-100;
  s=accept(s,command(s,'RollDice'),now,[2,2]).state;
  expect(s.purchase).not.toBeNull();
  s=accept(s,command(s,'EndTurn'),now).state;
  expect(s.turn!.quotas.builds).toBe(0);
  while(s.auction){const a=s.auction;s=accept(s,cmd('PassAuction',null,{actor:player(a.responder),target:{kind:'auctionResponse',id:a.responseId}}),now).state;}
  expect(s.turn!.bonus).toBe(true);expect(s.turn!.quotas.builds).toBe(1);
});


it.each(['BuildHouse', 'SellHouse'])('%s checks the deadline before asset legality (RVW-001)', type => {
  const s = owned();
  const assetId = 'unknown' as AssetId;
  const legality = type === 'BuildHouse' ? buildLegality : saleLegality;
  expect(legality(s, pid('a'), assetId)).toBe('NOT_A_BUILDABLE_ASSET');
  const c = command(s, type, { assetId });
  reject(s, c, 'NOT_A_BUILDABLE_ASSET', s.turn!.deadline - 1);
  for (const at of [s.turn!.deadline, s.turn!.deadline + 1]) {
    reject(s, c, 'DEADLINE_PASSED', at);
    expect(legality(s, pid('a'), assetId)).toBe('NOT_A_BUILDABLE_ASSET');
  }
});


// Helper/handler parity for an unexpired command (RVW-004).
function expectParity(s: GameState, type: string, by: ReturnType<typeof pid>, assetId: AssetId, at: number) {
  expect(at).toBeLessThan(s.turn!.deadline);
  const code = (type === 'BuildHouse' ? buildLegality : saleLegality)(s, by, assetId);
  const r = gameEngine.execute(deepFreeze(s), command(s, type, { assetId }, by), ctx(at));
  expect(r.kind === 'rejected' ? r.error.code : null).toBe(code);
}

it.each(['BuildHouse', 'SellHouse'])('%s checks auction pause, actor, then deadline (RVW-003)', type => {
  let s = owned();
  const assetId = group(s)[0]!.assetId;
  for (const by of [pid('a'), pid('b')]) expectParity(s, type, by, assetId, s.turn!.deadline - 1);
  expect((type === 'BuildHouse' ? buildLegality : saleLegality)(s, pid('b'), assetId)).toBe('NOT_ACTIVE_PLAYER');
  // An unpaused non-owner is rejected before checking the expired deadline.
  reject(s, command(s, type, { assetId }, pid('b')), 'NOT_ACTIVE_PLAYER', s.turn!.deadline + 5000);
  s = accept(s, command(s, 'RollDice'), undefined, [1, 5]).state;
  expect(s.purchase).not.toBeNull();
  const originalDeadline = s.turn!.deadline;
  s = accept(s, command(s, 'StartAuction'), originalDeadline - 1000).state;
  expect(s.turn!.pausedRemainingMs).toBe(1000);
  for (const by of [pid('a'), pid('b')]) {
    for (const at of [originalDeadline - 1, originalDeadline + 5000]) {
      reject(s, command(s, type, { assetId }, by), 'AUCTION_IN_PROGRESS', at);
    }
    expect((type === 'BuildHouse' ? buildLegality : saleLegality)(s, by, assetId)).toBe('AUCTION_IN_PROGRESS');
    expectParity(s, type, by, assetId, originalDeadline - 1);
  }
});

describe('houseCost and houseRefund display helpers', () => {
  it('equal Q(50% × price) and Q(50% × cost) for every monopoly price', () => {
    for (const c of base().board!.cells.filter(c => c.kind === 'monopoly')) {
      const price = c.asset!.price;
      expect(houseCost(price)).toBe(q(price, 2));
      expect(houseRefund(houseCost(price))).toBe(q(q(price, 2), 2));
    }
    for (const [n, cost, refund] of [[0, 0, 0], [10, 0, 0], [20, 10, 0], [150, 70, 30], [1990, 990, 490]] as const) {
      expect(houseCost(n as Money)).toBe(cost); expect(houseRefund(houseCost(n as Money))).toBe(refund);
    }
  });
  it('match the HouseBuilt cost and HouseSold refund of the handler', () => {
    for (const size of [2, 3]) {
      const s = owned(size), asset = group(s, size)[0]!;
      const built = accept(s, command(s, 'BuildHouse', { assetId: asset.assetId }));
      expect(built.events.find(e => e.type === 'HouseBuilt')!.payload).toMatchObject({ cost: houseCost(asset.price) });
      const sold = accept(built.state, command(built.state, 'SellHouse', { assetId: asset.assetId }));
      expect(sold.events.find(e => e.type === 'HouseSold')!.payload).toMatchObject({ refund: houseRefund(houseCost(asset.price)), auto: false });
    }
  });
});
