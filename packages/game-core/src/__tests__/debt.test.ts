import { describe, it, expect } from 'vitest';
import { settleDebt, mortgageAdvance, houseCost, houseRefund, rentFor, checkInvariants, gameEngine, createSession, restoreSession, projectEvents, pendingDeadlines, type GameState, type Money, type AssetId, type LiquidationApplied } from '../index.js';
import { forceEntropy } from './helpers/dice.js';
import { playingGame } from './helpers/game.js';
import { cmd, ctx, pid, player, deepFreeze } from './helpers/fixtures.js';
const now = ctx().now;
const money = (n: number) => n as Money;
function fixture(indices: number[], houses: Record<number, number> = {}, players = ['a','b','c']) {
  const s = playingGame(players).state;
  const id = (i: number) => s.board!.cells[i]!.asset!.assetId;
  return {...s, owners:Object.fromEntries(indices.map(i => [id(i),pid('a')])), houses:Object.fromEntries(Object.entries(houses).map(([i,n]) => [id(+i),n])), balances:{...s.balances,a:money(0)}, turn:{...s.turn!,rolled:true,pendingBonus:true}};
}
const asset = (s: GameState,i: number) => s.board!.cells[i]!.asset!;
function debt(s: GameState, amount: number) {
  return settleDebt(deepFreeze(s),{payerId:pid('a'),creditorId:pid('b'),amount:money(amount),cause:{kind:'rent',assetId:asset(s,39).assetId,auto:false}},now);
}
const steps = (r: ReturnType<typeof debt>) => (r.events.find(e => e.type === 'LiquidationApplied') as LiquidationApplied).payload.steps;
function due(s: GameState, amount: number): GameState {
  const a = asset(s,39);
  return {...s,owners:{...s.owners,[a.assetId]:pid('b')},positions:{...s.positions,a:39},rent:{payerId:pid('a'),ownerId:pid('b'),assetId:a.assetId,cell:39,kind:'regular',amount:money(amount),diceSum:null}};
}
function command(s: GameState,type: string) {
  return cmd(type,null,{...(type === 'Timeout' ? {} : {actor:player(s.turn!.playerId)}),target:{kind:'turn',id:s.turn!.turnId}});
}

describe('tiered debt',()=>{
  it.each([
    [[1,6],{},100,[[1,'mortgage',1]]],
    [[1,3],{},100,[[2,'mortgage',1]]],
    [[1,3],{1:1,3:1},100,[[3,'sell-house',1]]],
    [[1,3],{1:1,3:1},200,[[3,'sell-house',1],[3,'mortgage',1]]],
    [[1,3,6],{},500,[[1,'mortgage',6],[2,'mortgage',1]]],
    [[1,3,6],{1:1,3:1},500,[[1,'mortgage',6],[3,'sell-house',1]]],
    [[1,3],{1:1},100,[[2,'mortgage',3]]],
    [[1],{1:1},100,[[3,'sell-house',1]]],
  ] as [number[],Record<number,number>,number,[number,string,number][]][])('follows tiers and stops: %j %j debt %i',(indices,houses,amount,expected)=>{
    const s=fixture(indices,houses),r=debt(s,amount);
    expect(r.bankrupt).toBe(false);
    expect(steps(r).map(x=>[x.tier,x.kind,x.assetId])).toEqual(expected.map(([t,k,i])=>[t,k,asset(s,i).assetId]));
    expect(r.events.at(-1)!.payload).toMatchObject({amount,auto:false});
    expect(r.state.balances.a).toBeGreaterThanOrEqual(0);
    checkInvariants(r.state);
    for(const e of r.events.filter(e=>e.type==='HouseSold'||e.type==='AssetMortgaged')) expect(e.payload).toMatchObject({auto:true});
  });
  it('leaves a covering bare sale unmortgaged',()=>{
    const s=fixture([1],{1:1}),r=debt(s,180);
    expect(r.state.houses).toEqual({});expect(r.state.mortgages).toEqual({});
    expect(steps(r)).toHaveLength(1);
  });
  it('uses cash only when enough',()=>{
    const s=fixture([1]);s.balances.a=money(100);
    const r=debt(s,100);expect(r.state.owners).toEqual(s.owners);expect(r.state.mortgages).toEqual({});
    expect(r.events.map(e=>e.type)).toEqual(['BalanceChanged','BalanceChanged','RentPaid']);
  });
  it('orders ties by price then id and evaluates energy at seven',()=>{
    const s=fixture([6,8,9,12,28]);
    const r=debt(s,2000);
    const ordered=[6,8,9].map(i=>asset(s,i)).sort((a,b)=>a.price-b.price||(a.assetId<b.assetId?-1:1));
    // Rent ties at 90 are broken by price; energy reprices after its first mortgage.
    const expected=[12,28].map(i=>asset(s,i)).sort((a,b)=>a.assetId<b.assetId?-1:1);
    expect(rentFor(s,expected[0]!.assetId,7)).toBe(90);
    expect(steps(r).map(x=>x.assetId)).toEqual([...ordered.slice(0,2),...expected].map(a=>a.assetId));
  });
  it('reprices logistics between steps against energy',()=>{
    const s=fixture([5,15,12]);
    // Logistics start at 170 versus energy 40, then remaining logistics fall to 80.
    expect(rentFor(s,asset(s,5).assetId,7)).toBe(170);
    const r=debt(s,1600);
    expect(steps(r).map(x=>x.assetId)).toEqual([12,...[5,15].sort((a,b)=>asset(s,a).assetId<asset(s,b).assetId?-1:1)].map(i=>asset(s,i).assetId));
  });
  it('chooses built-only group keys and stays within the selected group',()=>{
    const s=fixture([1,3,6,8,9],{1:2,3:1,6:1,8:1,9:1});
    const r=debt(s,1600);
    const sales=steps(r).filter(x=>x.kind==='sell-house');
    expect(sales.slice(0,3).map(x=>x.assetId)).toEqual([1,1,3].map(i=>asset(s,i).assetId));
  });
  it('exhausts tier 2 before tier 3 and stops after every individual raising step',()=>{
    const s=fixture([1,3,6],{1:1,3:1});
    // Tier 1 advance 460, sale 180, immediate advance 360, sale 200, advance 400.
    const expected=[['mortgage',6,460],['sell-house',1,180],['mortgage',1,360],['sell-house',3,200],['mortgage',3,400]] as const;
    let raised=0;
    for(let n=0;n<expected.length;n++){
      const amount=raised+10;
      const r=debt(s,amount);
      expect(steps(r).map(x=>[x.kind,x.assetId,x.amount])).toEqual(expected.slice(0,n+1).map(([kind,i,value])=>[kind,asset(s,i).assetId,value]));
      const types=r.events.map(e=>e.type);
      const summary=types.indexOf('LiquidationApplied');
      expect(types.slice(summary)).toEqual(['LiquidationApplied','BalanceChanged','BalanceChanged','RentPaid']);
      expect((r.events[summary] as LiquidationApplied).payload).toMatchObject({debt:amount,cashBefore:0,raised:raised+expected[n]![2]});
      raised+=expected[n]![2];
    }
    const t=fixture([1,3],{1:1});
    expect(steps(debt(t,500)).map(x=>[x.tier,x.kind])).toEqual([[2,'mortgage'],[3,'sell-house']]);
  });
  it('recomputes the remaining logistics rent at every step',()=>{
    const s=fixture([5,15,25,35]);
    const r=debt(s,3000);
    let current=s;
    const quotes:number[]=[];
    for(const step of steps(r)){
      quotes.push(rentFor(current,step.assetId,7));
      current={...current,mortgages:{...current.mortgages,[step.assetId]:{advance:money(890),lapsCompleted:0,pending:s.order!}}};
    }
    expect(quotes).toEqual([710,350,170,80]);
    expect(steps(r).map(x=>x.assetId)).toEqual([5,15,25,35].map(i=>asset(s,i).assetId).sort());
  });
  it('counts mortgaged holdings toward completeness',()=>{
    const s=fixture([1,3,6]);
    const t={...s,mortgages:{[asset(s,3).assetId]:{advance:money(400),lapsCompleted:0,pending:s.order!}}};
    expect(steps(debt(t,500)).map(x=>x.tier)).toEqual([1,2]);
  });
});

describe('bankruptcy and scheduling',()=>{
  it('distinguishes exact full value from ten less and takes no advances',()=>{
    const s=fixture([1],{1:1});const full=houseRefund(houseCost(asset(s,1).price))+mortgageAdvance(asset(s,1).price);
    expect(debt(s,full).bankrupt).toBe(false);
    const r=debt(s,full+10);
    expect(r.bankrupt).toBe(true);expect(r.events.some(e=>e.type==='AssetMortgaged'||e.type==='RentPaid'||e.type==='LiquidationApplied')).toBe(false);
    expect(r.events.find(e=>e.type==='PlayerBankrupt')!.payload).toMatchObject({paid:180,writtenOff:370});
    expect(r.state.owners).toEqual({});expect(r.state.houses).toEqual({});expect(r.state.mortgages).toEqual({});
  });
  it('sells all houses evenly, pays cash and refunds, releases mortgages in board order',()=>{
    const base=fixture([1,3,6],{1:2,3:1});
    const s={...base,balances:{...base.balances,a:money(50)},mortgages:{[asset(base,6).assetId]:{advance:money(460),lapsCompleted:3,pending:base.order!}}};
    const r=debt(s,5000);
    expect(r.events.filter(e=>e.type==='HouseSold').map(e=>e.payload)).toEqual([
      {playerId:'a',assetId:asset(s,1).assetId,houses:1,refund:180,auto:true},
      {playerId:'a',assetId:asset(s,1).assetId,houses:0,refund:180,auto:true},
      {playerId:'a',assetId:asset(s,3).assetId,houses:0,refund:200,auto:true}]);
    expect(r.events.find(e=>e.type==='PlayerBankrupt')!.payload).toMatchObject({paid:610,writtenOff:4390});
    expect(r.events.find(e=>e.type==='AssetsReleased')!.payload).toEqual({playerId:'a',assetIds:[1,3,6].map(i=>asset(s,i).assetId),reason:'bankrupt'});
    expect(r.state.balances.b).toBe((s as GameState).balances.b!+610);
    expect(r.state.balances.a).toBe(0);
  });
  it('suppresses release and transfers for an empty zero-cash portfolio',()=>{
    const r=debt(fixture([]),100);
    expect(r.events.map(e=>e.type)).toEqual(['PlayerBankrupt']);
  });
  it.each(['PayRent','EndTurn','Timeout'])('closes %s exactly once, removing all eliminated participation',type=>{
    let s=due(fixture([1],{1:1}),1000);
    s={...s,jail:{a:{attemptsUsed:0}},mortgages:{[asset(s,39).assetId]:{advance:money(2400),lapsCompleted:6,pending:[pid('a')]}}};
    const r=gameEngine.execute(deepFreeze(s),command(s,type),ctx(type==='Timeout'?s.turn!.deadline:now));
    if(r.kind!=='accepted')throw new Error(r.error.code);
    checkInvariants(r.state);
    expect(r.state.revision).toBe(s.revision+1);expect(r.state.order).toEqual(['b','c']);
    expect(r.state.turn).toMatchObject({playerId:'b',bonus:false,quotas:{builds:1,offers:2}});
    expect(r.state.positions.a).toBeUndefined();expect(r.state.jail.a).toBeUndefined();
    expect(r.state.eliminations).toEqual([{playerId:'a',creditorId:'b',reason:'bankrupt',at:type==='Timeout'?s.turn!.deadline:now}]);
    expect(r.state.mortgages[asset(s,39).assetId]).toMatchObject({lapsCompleted:7,pending:['b','c']});
    expect(r.events.filter(e=>e.type==='TurnEnded')).toHaveLength(1);
    expect(r.events.find(e=>e.type==='TurnEnded')!.payload).toMatchObject({reason:'bankrupt'});
  });
  it.each(['PayRent','EndTurn','Timeout'])('finishes from %s without boundary or deadlines',type=>{
    const base=due(fixture([],{},['a','b']),100);
    const s={...base,mortgages:{[asset(base,39).assetId]:{advance:money(2400),lapsCompleted:7,pending:[pid('a')]}}};
    const r=gameEngine.execute(deepFreeze(s),command(s,type),ctx(type==='Timeout'?s.turn!.deadline:now));
    if(r.kind!=='accepted')throw new Error(r.error.code);
    checkInvariants(r.state);expect(r.state.phase).toBe('finished');expect(r.state.winner).toBe('b');
    expect(pendingDeadlines(r.state)).toEqual([]);expect(r.state.mortgages[asset(s,39).assetId]).toMatchObject({lapsCompleted:7,pending:[]});
    expect(r.events.map(e=>e.type)).toEqual(['PlayerBankrupt','TurnEnded','GameEnded']);
    expect(r.events.at(-1)!.payload).toMatchObject({winner:'b',finalBalances:r.state.balances,eliminations:r.state.eliminations});
    expect(gameEngine.execute(r.state,command(s,'PayRent'),ctx()).kind).toBe('rejected');
  });
  it('projects detached ordered debt events to every viewer',()=>{
    for(const s of [fixture([1]),fixture([1],{1:1})]){
      const r=debt(s,s.houses[asset(s,1).assetId] ? 3000 : 100);
      for(const viewer of [{kind:'spectator'} as const,...['a','b','c'].map(id=>({kind:'player' as const,id:pid(id)}))]){
        const view=projectEvents(r.events,viewer);expect(view).toEqual(r.events);
        (view[0]!.payload as Record<string,unknown>).changed=true;
        expect(r.events[0]!.payload).not.toHaveProperty('changed');
      }
    }
  });
});

it('replays and restores liquidation, bankruptcy and finish from every snapshot',()=>{
  let initial: GameState=fixture([1,3,11]);
  const creditorAssets=[6,8,9,16,18,19];
  initial={...initial,balances:{...initial.balances,b:money(0),c:money(0)},
    owners:{...initial.owners,...Object.fromEntries(creditorAssets.map(i=>[asset(initial,i).assetId,pid('c')]))},
    houses:Object.fromEntries(creditorAssets.map(i=>[asset(initial,i).assetId,4])),
    positions:{a:9,b:13,c:0},turn:{...initial.turn!,pendingBonus:false},
    rent:{payerId:pid('a'),ownerId:pid('c'),assetId:asset(initial,9).assetId,cell:9,kind:'regular',amount:money(1030),diceSum:null}};
  checkInvariants(initial);
  const session=createSession(gameEngine,initial);
  const snapshots=[{state:initial,index:0}];
  const submit=(type:string,dice?:number[])=>{
    const s=session.state;
    const r=session.submit(command(s,type),ctx(now,dice?forceEntropy(s.rng!,dice):undefined));
    if(r.kind!=='accepted')throw new Error(r.error.code);
    snapshots.push({state:session.state,index:session.log.length});return r;
  };
  expect(submit('EndTurn').events.some(e=>e.type==='LiquidationApplied')).toBe(true);
  submit('RollDice',[1,2]);
  expect(submit('PayRent').events.some(e=>e.type==='PlayerBankrupt')).toBe(true);
  submit('RollDice',[1,2]);submit('EndTurn');
  submit('RollDice',[3,4]);
  expect(submit('PayRent').events.map(e=>e.type)).toContain('GameEnded');
  expect(session.state.phase).toBe('finished');
  for(const snapshot of snapshots){
    const restored=restoreSession(gameEngine,snapshot.state,session.log.slice(snapshot.index));
    expect(restored.state).toEqual(session.state);
    expect(restored.log).toEqual(session.log.slice(snapshot.index));
    expect(pendingDeadlines(restored.state)).toEqual(pendingDeadlines(session.state));
    expect(restored.state.rng).toEqual(session.state.rng);
  }
});
