import { describe, it, expect } from 'vitest';
import { gameEngine, nextBidAmount, checkInvariants, projectState, projectEvents, replay, restoreSession, pendingDeadlines, timestamp, type GameState, type Money, type GameCommand } from '../index.js';
import { playingGame, types, type Game } from './helpers/game.js';
import { cmd, ctx, player, pid, deepFreeze } from './helpers/fixtures.js';

function turnCmd(g: Game, type: string, payload: unknown = null, by = g.state.turn!.playerId): GameCommand {
  return cmd(type, payload, { actor: player(by), target: { kind: 'turn', id: g.state.turn!.turnId } });
}
function response(g: Game, type = 'PassAuction', payload: unknown = null, by = g.state.auction!.responder): GameCommand {
  return cmd(type, payload, { actor: player(by), target: { kind: 'auctionResponse', id: g.state.auction!.responseId } });
}
function offered(ids = ['a', 'b', 'c']): Game {
  const g = playingGame(ids);
  g.roll(1, 2); // monopoly on cell 3
  expect(g.state.purchase).toMatchObject({ playerId: 'a', cell: 3 });
  return g;
}
function auction(ids = ['a', 'b', 'c']): Game {
  const g = offered(ids);
  g.ok(turnCmd(g, 'StartAuction'));
  return g;
}
function allPass(g: Game) { const events = []; while (g.state.auction) events.push(...g.ok(response(g))); return events; }
function resign(g: Game, id: string) { return g.ok(cmd('Resign', null, { actor: player(id), rev: g.state.revision })); }
function reject(g: Game, c: GameCommand, code: string, at = g.now) {
  const before = deepFreeze(g.state);
  const r = g.submit(c, { at });
  expect(r.kind === 'rejected' && r.error.code).toBe(code);
  expect(g.state).toBe(before);
  expect(g.state.rng).toBe(before.rng);
}

describe('purchase commands and landing', () => {
  it('initializes acquisition fields and supports core-5 only', () => {
    const g = playingGame(['a','b']);
    expect(g.state).toMatchObject({ owners: {}, purchase: null, auction: null, rulesVersion: 'core-5', turn: { pausedRemainingMs: null } });
  });
  it.each([[1,2,'monopoly'], [2,3,'logistics'], [6,6,'energy']] as const)('offers %s + %s landing on %s', (d1,d2,kind) => {
    const g = playingGame(['a','b']); const events = g.roll(d1,d2);
    expect(g.state.board!.cells[d1+d2]!.kind).toBe(kind);
    expect(events.at(-1)!.type).toBe('PurchaseOffered');
    expect(g.state.purchase!.cell).toBe(d1+d2);
  });
  it('buys atomically, with exact-balance and unaffordable coverage', () => {
    const g = offered(); const s = g.state; const p = s.purchase!; const price = s.board!.cells[p.cell]!.asset!.price;
    const c = turnCmd(g,'BuyAsset');
    for (const balance of [price, price+10]) {
      const r = gameEngine.execute(deepFreeze({ ...s, balances: { ...s.balances, a: balance as Money } }), c, ctx(g.now));
      expect(r.kind).toBe('accepted');
      if (r.kind === 'accepted') {
        expect(r.state.balances.a).toBe(balance-price); expect(r.state.owners[p.assetId]).toBe('a'); expect(r.state.purchase).toBeNull();
        expect(types(r.events)).toEqual(['BalanceChanged','AssetPurchased']);
        expect(r.events[0]!.payload).toMatchObject({ delta: -price, reason: 'purchase' });
      }
    }
    const poor = deepFreeze({ ...s, balances: { ...s.balances, a: (price-10) as Money } });
    const r = gameEngine.execute(poor,c,ctx(g.now)); expect(r.kind === 'rejected' && r.error.code).toBe('INSUFFICIENT_FUNDS'); expect(r.state).toBe(poor);
    expect(gameEngine.execute(poor,turnCmd(g,'StartAuction'),ctx(g.now)).kind).toBe('accepted');
  });
  it.each(['BuyAsset','StartAuction'])('%s validates payload, actor, target, missing decision and time', type => {
    const g = offered();
    reject(g,turnCmd(g,type,{}),'INVALID_PAYLOAD'); reject(g,turnCmd(g,type,null,pid('b')),'NOT_ACTIVE_PLAYER');
    reject(g,{ ...turnCmd(g,type), expected: {kind:'target',target:{kind:'turn',id:'old'}} },'TARGET_MISMATCH');
    for (const offset of [0,1]) reject(g,turnCmd(g,type),'DEADLINE_PASSED',g.deadline+offset);
    const fresh = playingGame(['a','b']); reject(fresh,turnCmd(fresh,type),'NO_PURCHASE');
    expect(g.submit(turnCmd(g,type),{at:g.deadline-1}).kind).toBe('accepted');
  });
  it('places lap credit before the purchase offer', () => {
    const g = playingGame(['a','b']);
    const before = { ...g.state, positions: { ...g.state.positions, a: 38 } };
    g.roll(2,3);
    const entry = g.session.log.at(-1)!;
    const result = gameEngine.execute(before, entry.command, { now: entry.now, entropy: entry.entropy });
    expect(result.kind).toBe('accepted');
    expect(types(result.events)).toEqual(['DiceRolled','PlayerMoved','BalanceChanged','PurchaseOffered']);
    expect(result.state.balances.a).toBe(before.balances.a! + before.economy!.lapReward);
    expect(result.state.purchase!.cell).toBe(3);
  });
  it('uses own-key-safe acquisition records for arbitrary participant ids', () => {
    const g = playingGame(['__proto__','constructor']);
    g.roll(1,2); const assetId = g.state.purchase!.assetId;
    g.ok(turnCmd(g,'BuyAsset'));
    expect(g.state.owners[assetId]).toBe('__proto__');
    expect(Object.hasOwn(g.state.balances,'__proto__')).toBe(true);
    checkInvariants(g.state);
  });
  it('enforces phase and actor-kind envelopes for acquisition commands', () => {
    for (const type of ['BuyAsset','StartAuction','Bid','PassAuction']) {
      const g = type === 'Bid' || type === 'PassAuction' ? auction() : offered();
      const c = g.state.auction ? response(g,type) : turnCmd(g,type);
      const wrongPhase = gameEngine.execute({ ...g.state, phase: 'setup' }, c, ctx(g.now));
      expect(wrongPhase.kind === 'rejected' && wrongPhase.error.code).toBe('PHASE_NOT_ALLOWED');
      reject(g,{ ...c, actor: { kind: 'system' } },'ACTOR_NOT_ALLOWED');
    }
  });
  it('owned landing is inert for either owner', () => {
    for (const owner of [pid('a'),pid('b')]) {
      const g = playingGame(['a','b']); const asset = g.state.board!.cells[3]!.asset!;
      const s = { ...g.state, owners: { [asset.assetId]: owner } };
      // Force entropy through the helper then repeat its input on this altered state.
      g.roll(1,2);
      const entry = g.session.log.at(-1)!;
      const r = gameEngine.execute(s,entry.command,{now:entry.now,entropy:entry.entropy});
      expect(r.kind).toBe('accepted'); expect(r.state.purchase).toBeNull();

    }
  });
});

describe('cyclic fixed-raise auctions', () => {
  it.each([2,3,4,5,6])('%s players: cyclic order, leader skipped, raises reserve without debits, single settlement', n => {
    const g = auction(['a','b','c','d','e','f'].slice(0,n));
    const a = g.state.auction!; const balances = g.state.balances;
    expect(a.order).toEqual(g.state.order); expect(a.responseDeadline).toBe(g.now+10000);
    expect(nextBidAmount(a)).toBe(a.startBid);
    g.ok(response(g,'Bid')); expect(g.state.balances).toEqual(balances);
    expect(g.state.auction!.responder).toBe('b'); expect(nextBidAmount(g.state.auction!)).toBe(a.startBid+a.step);
    const winningCommand = response(g,'Bid'); g.ok(winningCommand);
    expect(g.state.auction!.leader).toBe('b');
    const final = allPass(g);
    expect(types(final).filter(x=>x==='AuctionWon')).toHaveLength(1);
    expect(g.state.owners[a.assetId]).toBe('b');
    expect(g.state.balances.b).toBe(balances.b! - a.startBid - a.step);
    expect(g.state.balances.a).toBe(balances.a);
    const before = g.state; g.ok(winningCommand); expect(g.state).toBe(before); // session duplicate
    reject(g,{...winningCommand,commandId:'fresh-stale' as never},'TARGET_MISMATCH');
  });
  it('every prices-1 asset has positive quantum start and step', () => {
    const g=auction(); const a=g.state.auction!;
    for (const cell of g.state.board!.cells) if(cell.asset) {
      const start=10*Math.floor(60*cell.asset.price/1000); const step=10*Math.floor(5*cell.asset.price/1000);
      expect(start).toBeGreaterThan(0);expect(step).toBeGreaterThan(0);expect(start%10).toBe(0);expect(step%10).toBe(0);
      expect(nextBidAmount({...a,startBid:start as Money,step:step as Money})).toBe(start);
    }
  });
  it('all-pass leaves the asset free and balances unchanged', () => {
    const g=auction(); const balances=g.state.balances; const events=allPass(g);
    expect(g.state.owners).toEqual({});expect(g.state.balances).toEqual(balances);expect(types(events)).toContain('AuctionEndedUnsold');
  });
  it('one bid wins after every opponent passes', () => {
    const g=auction(); const a=g.state.auction!;g.ok(response(g,'Bid'));allPass(g);
    expect(g.state.owners[a.assetId]).toBe('a');expect(g.state.balances.a).toBe(19940-a.startBid);
  });
  it('starts cyclic order at a landing player other than the first', () => {
    const g=playingGame(['a','b','c']);g.roll(1,3);g.endTurn();g.roll(1,2);g.ok(turnCmd(g,'StartAuction'));
    expect(g.state.auction!.order).toEqual(['b','c','a']);
  });
  it.each(['Bid','PassAuction'])('%s guards responder, null payload, time and stale slots',type=>{
    const g=auction();reject(g,response(g,type,{}),'INVALID_PAYLOAD');reject(g,response(g,type,null,pid('b')),'NOT_ACTIVE_PLAYER');
    const c=response(g,type); for(const offset of [0,1])reject(g,c,'DEADLINE_PASSED',g.deadline+offset);
    const before=g.state;const r=g.submit(c,{at:g.deadline-1});expect(r.kind).toBe('accepted');
    expect(g.state.auction!.responseId).not.toBe(before.auction!.responseId);
    reject(g,{...c,commandId:'new-stale' as never},'TARGET_MISMATCH');
  });
  it('rejects over-balance computed bid without changing RNG',()=>{
    const g=auction();const s=deepFreeze({...g.state,balances:{...g.state.balances,a:0 as Money}});
    const r=gameEngine.execute(s,response(g,'Bid'),ctx(g.now));expect(r.kind==='rejected'&&r.error.code).toBe('INSUFFICIENT_FUNDS');expect(r.state).toBe(s);
  });
  it('AFK timeout auto-passes at or after deadline, never before',()=>{
    const g=auction();reject(g,g.timeoutCmd(),'DEADLINE_NOT_REACHED',g.deadline-1);
    const c=g.timeoutCmd();const events=g.timeout();expect(events[0]).toMatchObject({type:'AuctionPassed',payload:{playerId:'a',auto:true}});
    expect(g.state.auction!.responder).toBe('b');expect(g.state.auction!.responseDeadline).toBe(g.now+10000);
    reject(g,{...c,commandId:'stale-timeout' as never},'TARGET_MISMATCH');
    g.timeout({at:g.deadline+1});g.timeout();expect(g.state.auction).toBeNull();
  });
});

describe('turn pause, resume and closure',()=>{
  it('choice preserves id/quotas/bonus and exact remaining time',()=>{
    const g=offered();const original=g.state.turn!;g.now=original.deadline-12345;
    const stale=g.timeoutCmd();g.ok(turnCmd(g,'StartAuction'));expect(g.state.turn!.pausedRemainingMs).toBe(12345);
    expect(pendingDeadlines(g.state)).toEqual([{target:{kind:'auctionResponse',id:g.state.auction!.responseId},at:g.now+10000}]);
    for(const type of ['RollDice','EndTurn','BuyAsset','StartAuction'])reject(g,turnCmd(g,type),'AUCTION_IN_PROGRESS');
    reject(g,stale,'TARGET_MISMATCH',original.deadline+1);
    g.timeout();g.now+=1000;const events=allPass(g);
    expect(g.state.turn).toEqual({...original,deadline:timestamp(g.now+12345),pausedRemainingMs:null});expect(types(events).at(-1)).toBe('TurnResumed');
  });
  it.each(['end-turn','timeout'] as const)('%s defers closure until auction settles',reason=>{
    const g=offered();const id=g.state.turn!.turnId;
    if(reason==='timeout')g.timeout();else g.ok(g.endTurnCmd());
    expect(g.state.auction!.reason).toBe(reason);expect(g.state.turn!.turnId).toBe(id);
    const events=allPass(g);expect(types(events).slice(-2)).toEqual(['TurnEnded','TurnStarted']);
    expect(events.at(-2)!.payload).toMatchObject({reason});expect(g.state.turn!.playerId).toBe('b');expect(g.state.turn!.deadline).toBe(g.now+45000);
  });
  it('deferred end-turn grants a fresh bonus turn after a double',()=>{
    const g=playingGame(['a','b']);g.roll(1,1);g.ok(g.endTurnCmd());allPass(g);
    expect(g.state.turn).toMatchObject({playerId:'a',bonus:true,rolled:false,pausedRemainingMs:null,quotas:{builds:1,offers:2}});
  });
  it('automatic roll opens a decision with continuation, then times out into auction',()=>{
    const g=playingGame(['a','b']);g.timeout({dice:[1,2]});expect(g.state.purchase).not.toBeNull();expect(g.state.auction).toBeNull();expect(g.state.turn!.deadline).toBe(g.now+20000);
    g.timeout();expect(g.state.turn!.pausedRemainingMs).toBe(0);expect(g.state.auction!.reason).toBe('timeout');allPass(g);expect(g.state.turn!.playerId).toBe('b');
  });
});

describe('isolated provisional E1 policy',()=>{
  it('decision holder drops the decision without auction and cancels bonus',()=>{
    const g=offered();const events=resign(g,'a');expect(g.state.purchase).toBeNull();expect(g.state.auction).toBeNull();expect(g.state.turn!.playerId).toBe('b');expect(types(events)).toEqual(['PlayerResigned','TurnEnded','TurnStarted']);
  });
  it('non-responder passes without changing response target or deadline',()=>{
    const g=auction(['a','b','c','d']);const a=g.state.auction!;resign(g,'c');expect(g.state.auction).toEqual({...a,passed:['c']});
  });
  it('responder departure advances; eliminated owner closes only at resolution',()=>{
    const g=auction(['a','b','c','d']);resign(g,'a');expect(g.state.turn).toMatchObject({playerId:'a',pendingBonus:false});expect(g.state.auction!.responder).toBe('b');
    resign(g,'b');expect(g.state.auction!.responder).toBe('c');const events=allPass(g);
    expect(events.at(-2)!.payload).toMatchObject({reason:'resigned',playerId:'a'});expect(g.state.turn).toMatchObject({playerId:'c',bonus:false});
  });
  it.each([true,false])('leader departure voids without debit; leader is owner=%s',owner=>{
    const g=auction(['a','b','c','d']); if(!owner)g.ok(response(g));g.ok(response(g,'Bid'));
    const leader=g.state.auction!.leader!;const balances=g.state.balances;const events=resign(g,leader);
    expect(g.state.auction).toBeNull();expect(g.state.owners).toEqual({});expect(g.state.balances).toEqual(balances);expect(types(events)).toContain('AuctionEndedUnsold');
    expect(g.state.turn!.playerId).toBe(owner?'b':'a');
  });
  it('resigning the last opponent resolves a standing bid',()=>{
    const g=auction();g.ok(response(g,'Bid'));g.ok(response(g));const a=g.state.auction!;resign(g,'c');expect(g.state.owners[a.assetId]).toBe('a');expect(g.state.auction).toBeNull();
  });
  it.each(['decision','auction'])('immediate victory clears %s and every timer',kind=>{
    const g=kind==='decision'?offered(['a','b']):auction(['a','b']);resign(g,'a');expect(g.state).toMatchObject({phase:'finished',winner:'b',purchase:null,auction:null,turn:null});expect(pendingDeadlines(g.state)).toEqual([]);
  });
});

describe('invariants, projection and replay',()=>{
  it('rejects corrupt acquisition state and accepts only paused eliminated owner exception',()=>{
    const g=auction();const s=g.state;const a=s.auction!;
    const invalid: GameState[]=[{...s,owners:{unknown:pid('a')}},{...s,owners:{[a.assetId]:pid('stranger')}},{...s,purchase:{playerId:pid('a'),cell:a.cell,assetId:a.assetId}}, {...s,turn:{...s.turn!,pausedRemainingMs:null}}, {...s,auction:{...a,responder:pid('stranger')}},{...s,auction:{...a,leader:pid('b'),leadingBid:9999990 as Money}}];
    for(const bad of invalid)expect(()=>checkInvariants(bad)).toThrow();
    const p=offered().state;expect(()=>checkInvariants({...p,positions:{...p.positions,a:4}})).toThrow();
    resign(g,'a');expect(()=>checkInvariants(g.state)).not.toThrow();
    expect(()=>checkInvariants({...g.state,auction:null})).toThrow();
  });
  it('public projections are detached for every viewer, events fully classified',()=>{
    const g=auction();g.ok(response(g,'Bid'));
    for(const viewer of [{kind:'spectator' as const},{kind:'player' as const,id:pid('a')},{kind:'player' as const,id:pid('b')},{kind:'player' as const,id:pid('stranger')}]) {
      const view=projectState(g.state,viewer);expect(view).not.toHaveProperty('rng');expect(view.auction).toEqual(g.state.auction);expect(view.auction).not.toBe(g.state.auction);expect(view.auction!.order).not.toBe(g.state.auction!.order);expect(view.owners).not.toBe(g.state.owners);
      expect(projectEvents(g.session.log.flatMap(e=>e.events),viewer)).toEqual(g.session.log.flatMap(e=>e.events));
    }
  });
  it('JSON snapshots at decision, bid and deferred resignation restore exact tail and deadlines',()=>{
    const g=offered(['a','b','c','d']);const snapshots=[JSON.parse(JSON.stringify(g.state)) as GameState];
    g.ok(turnCmd(g,'StartAuction'));g.ok(response(g,'Bid'));snapshots.push(JSON.parse(JSON.stringify(g.state)) as GameState);
    // Outbid the owner so its departure defers closure.
    g.ok(response(g,'Bid'));resign(g,'a');snapshots.push(JSON.parse(JSON.stringify(g.state)) as GameState);
    while(g.state.auction)g.timeout();
    for(const snapshot of snapshots) {
      const restored=restoreSession(gameEngine,snapshot,g.session.log.slice(snapshot.revision));
      expect(restored.state).toEqual(g.state);expect(pendingDeadlines(restored.state)).toEqual(pendingDeadlines(g.state));
    }
    expect(replay(gameEngine,g.session.log).state).toEqual(g.state);
  });
});
