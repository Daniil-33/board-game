import { afterEach, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, casinoCap, createSession, entropy, gameEngine, genesis, timestamp, upgradeState, type GameCommand, type GameState } from '@game/game-core';
import { sql } from 'kysely';
import { buildFixture } from '../test-fixtures.js';
import { useHarness } from './helpers/harness.js';
import { byPlayer, T0 } from './helpers/game.js';
import { logEntries, seedRoom, snapshotRevisions } from './helpers/db.js';
import { stopServers } from './helpers/server.js';

const h = useHarness({ perTest: true });
afterEach(stopServers);

async function insertOldSnapshot(id: string): Promise<{ legacy: GameState; current: GameState }> {
  const current = buildFixture('mortgage-restart', ['legacy-a', 'legacy-b', 'legacy-c'], T0);
  const raw = JSON.parse(JSON.stringify(current)) as Record<string, any>;
  raw.rulesVersion = 'core-7';
  delete raw.charge;
  delete raw.casino;
  raw.jail = { ...raw.jail, [raw.turn.playerId]: { attemptsUsed: 1 } };
  for (const mortgage of Object.values(raw.mortgages) as Record<string, any>[]) delete mortgage.lockedTurnId;
  const legacy = raw as GameState;
  await h.db.updateTable('rooms').set({ status: 'playing' }).where('id', '=', id).execute();
  await h.db.insertInto('game_snapshots').values({ game_id: id, revision: legacy.revision,
    state: sql`${JSON.stringify(legacy)}::jsonb` }).execute();
  return { legacy, current };
}

const storedRows = async (id: string) => ({
  room: await h.db.selectFrom('rooms').selectAll().where('id', '=', id).execute(),
  members: await h.db.selectFrom('room_members').selectAll().where('room_id', '=', id).execute(),
  logs: await h.db.selectFrom('game_log').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
  snapshots: await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
});

async function saveSnapshot(id:string,state:GameState) {
  await h.db.updateTable('rooms').set({status:'playing'}).where('id','=',id).execute();
  await h.db.insertInto('game_snapshots').values({game_id:id,revision:state.revision,
    state:sql`${JSON.stringify(state)}::jsonb`}).execute();
}

it('restores a prisoner, casino offer, chance charge and redeem lock exactly',async()=>{
  const ids=await Promise.all(Array.from({length:4},()=>seedRoom(h.db)));
  const expected=ids.map((_,i)=>buildFixture('own-asset',['a','b','c'],T0+i));
  const prisonerId=expected[0]!.turn!.playerId;
  const casinoId=expected[1]!.turn!.playerId;
  const chargeId=expected[2]!.turn!.playerId;
  const mortgageId=expected[3]!.turn!.playerId;
  const base=expected[0]!;
  const asset=base.board!.cells[1]!.asset!;
  expected[0]={...base,jail:{[prisonerId!]:{attemptsUsed:2}},positions:{...base.positions,[prisonerId!]:10},turn:{...base.turn!,rolled:false}};
  expected[1]={...expected[1]!,positions:{...expected[1]!.positions,[casinoId!]:20},casino:{playerId:casinoId!,turnId:expected[1]!.turn!.turnId,cap:casinoCap(expected[1]!.economy)}};
  expected[2]={...expected[2]!,positions:{...expected[2]!.positions,[chargeId!]:2},charge:{payerId:chargeId!,amount:1490 as never,cause:'chance'}};
  expected[3]={...expected[3]!,mortgages:{[asset.assetId]:{advance:360 as never,lapsCompleted:0,pending:[],lockedTurnId:expected[3]!.turn!.turnId}},owners:{...expected[3]!.owners,[asset.assetId]:mortgageId!}};
  for(let i=0;i<ids.length;i++) await saveSnapshot(ids[i]!,expected[i]!);
  const {manager}=h.manager();
  for(let i=0;i<ids.length;i++) expect((await manager.open(ids[i]!)).state).toEqual(expected[i]);
  await manager.shutdown();
  const restored=h.manager();
  expect(await restored.manager.restoreAll()).toEqual({restored:ids,failed:[]});
  for(let i=0;i<ids.length;i++) expect(restored.manager.get(ids[i]!)!.state).toEqual(expected[i]);
});

it('upgrades a core-8 prisoner snapshot to core-9 without losing attempts',async()=>{
  const id=await seedRoom(h.db),current=buildFixture('own-asset',['a','b'],T0);
  const playerId=current.turn!.playerId;
  const core8:GameState={...current,rulesVersion:'core-8',casino:undefined,jail:{[playerId]:{attemptsUsed:2}},positions:{...current.positions,[playerId]:10},turn:{...current.turn!,rolled:false}};
  await saveSnapshot(id,core8);
  const {manager}=h.manager();
  const room=await manager.open(id);
  expect(room.state).toMatchObject({rulesVersion:'core-9',casino:null,jail:{[playerId]:{attemptsUsed:2}}});
});

it('keeps genesis equal after shutdown snapshot and restore',async()=>{
  const id=await seedRoom(h.db),first=h.manager();
  const room=await first.manager.open(id);
  expect(room.state).toEqual(genesis());
  await first.manager.shutdown();
  expect(await snapshotRevisions(h.db,id)).toEqual([0]);
  const second=h.manager();
  expect(await second.manager.restoreAll()).toEqual({restored:[id],failed:[]});
  expect(second.manager.get(id)!.state).toEqual(genesis());
});

it('upgrades a core-7 prisoner and mortgage in memory, then replays a new tail without shutdown snapshot', async () => {
  const id = await seedRoom(h.db);
  const { legacy } = await insertOldSnapshot(id);
  const first = h.manager();
  const live = await first.manager.open(id);
  expect(live.state.rulesVersion).toBe('core-9');
  expect(live.state.charge).toBeNull();
  expect(live.state.casino).toBeNull();
  expect(live.state.jail).toEqual(legacy.jail);
  expect(Object.values(live.state.mortgages).every(term => term.lockedTurnId === null)).toBe(true);
  expect(await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', id).executeTakeFirstOrThrow()).toMatchObject({ state: legacy });

  const before = live.state;
  const accepted = await live.submit(byPlayer('EndTurn', before.turn!.playerId, { kind: 'turn', id: before.turn!.turnId }));
  expect(accepted.kind).toBe('accepted');
  const liveAfterTail = live.state;
  expect(await snapshotRevisions(h.db, id)).toEqual([legacy.revision]);
  expect((await logEntries(h.db, id)).at(-1)!.revision).toBe(liveAfterTail.revision);

  // Simulated crash: restore through a new manager before the first manager can snapshot.
  const second = h.manager();
  expect(await second.manager.restoreAll()).toEqual({ restored: [id], failed: [] });
  expect(second.manager.get(id)!.state).toEqual(liveAfterTail);
  expect(await snapshotRevisions(h.db, id)).toEqual([legacy.revision]);
  expect((await storedRows(id)).snapshots[0]!.state).toEqual(legacy);
});

it('fails and logs a core-7 log-only game from genesis without changing any rows', async () => {
  const id = await seedRoom(h.db);
  await h.db.updateTable('rooms').set({ status: 'playing' }).where('id', '=', id).execute();
  const session = createSession(gameEngine);
  const command = { type: 'CreateGame', commandId: 'old-create' as never, actor: { kind: 'system' as const },
    expected: { kind: 'revision' as const, revision: 0 as never }, payload: { seed: 42, rulesVersion: CURRENT_RULES_VERSION } };
  const created = session.submit(command, { now: timestamp(T0), entropy: entropy([1, 2, 3, 4]) });
  expect(created.kind).toBe('accepted');
  const core8Entry = session.log[0]!;
  const oldEntry = { ...core8Entry, command: { ...core8Entry.command, payload: { seed: 42, rulesVersion: 'core-7' } } };
  await h.db.insertInto('game_log').values({ game_id: id, revision: oldEntry.revision, command_id: oldEntry.command.commandId,
    entry: sql`${JSON.stringify(oldEntry)}::jsonb` }).execute();
  const before = await storedRows(id);

  const { manager, logger } = h.manager();
  expect(await manager.restoreAll()).toEqual({ restored: [], failed: [id] });
  expect(manager.get(id)?.status).toBe('failed');
  expect(logger.lines).toContainEqual(expect.objectContaining({
    level: 'error', message: 'room could not be restored',
    fields: expect.objectContaining({ gameId: id, errorName: 'ReplayDivergenceError' }),
  }));
  await manager.shutdown();
  expect(await storedRows(id)).toEqual(before);
});

it('fails a core-7 snapshot with a diverging same-turn mortgage and redeem tail without changing rows', async () => {
  const id = await seedRoom(h.db);
  const { legacy: withMortgage } = await insertOldSnapshot(id);
  const assetId = Object.keys(withMortgage.mortgages)[0]!;
  const legacy: GameState = { ...withMortgage, mortgages: {} };
  await h.db.updateTable('game_snapshots').set({ state: sql`${JSON.stringify(legacy)}::jsonb` })
    .where('game_id', '=', id).where('revision', '=', legacy.revision).execute();

  const turn = legacy.turn!;
  const target = { kind: 'turn' as const, id: turn.turnId };
  const mortgageCommand: GameCommand = { type: 'Mortgage', commandId: 'old-mortgage' as never,
    actor: { kind: 'player', id: turn.playerId }, expected: { kind: 'target', target }, payload: { assetId } };
  const mortgageNow = timestamp(T0 + 1_000);
  const mortgageEntropy = entropy([1, 2, 3, 4]);
  const mortgage = gameEngine.execute(upgradeState(legacy), mortgageCommand, { now: mortgageNow, entropy: mortgageEntropy });
  if (mortgage.kind !== 'accepted') throw new Error(`Mortgage rejected: ${mortgage.error.code}`);

  // This is the event/state shape an old core-7 server accepted before the same-turn lock existed.
  const oldMortgageState: GameState = { ...mortgage.state, mortgages: {
    ...mortgage.state.mortgages,
    [assetId]: { ...mortgage.state.mortgages[assetId]!, lockedTurnId: null },
  } };
  const redeemCommand: GameCommand = { type: 'Redeem', commandId: 'old-redeem' as never,
    actor: { kind: 'player', id: turn.playerId }, expected: { kind: 'target', target }, payload: { assetId } };
  const redeemNow = timestamp(T0 + 2_000);
  const redeemEntropy = entropy([5, 6, 7, 8]);
  const redeem = gameEngine.execute(oldMortgageState, redeemCommand, { now: redeemNow, entropy: redeemEntropy });
  if (redeem.kind !== 'accepted') throw new Error(`Legacy Redeem rejected: ${redeem.error.code}`);

  const tail = [
    { command: mortgageCommand, now: mortgageNow, entropy: mortgageEntropy, revision: mortgage.revision, events: mortgage.events },
    { command: redeemCommand, now: redeemNow, entropy: redeemEntropy, revision: redeem.revision, events: redeem.events },
  ];
  await h.db.insertInto('game_log').values(tail.map(entry => ({ game_id: id, revision: entry.revision,
    command_id: entry.command.commandId, entry: sql`${JSON.stringify(entry)}::jsonb` }))).execute();
  const before = await storedRows(id);

  const { manager, logger } = h.manager();
  expect(await manager.restoreAll()).toEqual({ restored: [], failed: [id] });
  expect(manager.get(id)?.status).toBe('failed');
  expect(logger.lines).toContainEqual(expect.objectContaining({
    level: 'error', message: 'room could not be restored',
    fields: expect.objectContaining({ gameId: id, errorName: 'ReplayDivergenceError', tailIndex: 1, errorCode: 'REDEEM_LOCKED' }),
  }));
  await manager.shutdown();
  expect(await storedRows(id)).toEqual(before);
});
