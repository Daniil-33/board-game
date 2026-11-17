import { expect, it } from 'vitest';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { CommandFrameSchema, decodeClientFrame } from '../index.js';

const check = TypeCompiler.Compile(CommandFrameSchema);
it.each(['BuyAsset', 'StartAuction', 'Bid', 'PassAuction'])('%s accepts only a null payload', type => {
  for (const expected of [
    { kind: 'revision', revision: 7 },
    { kind: 'target', target: { kind: 'auctionResponse', id: 'response-7' } },
  ]) {
    const frame = { t: 'Command', commandId: 'stage3', type, expected, payload: null };
    expect(check.Check(frame)).toBe(true);
    expect(decodeClientFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
    for (const payload of [{}, [], 0, false, '', { amount: 100 }, { playerId: 'other' }]) {
      expect(check.Check({ ...frame, payload })).toBe(false);
      expect(decodeClientFrame(JSON.stringify({ ...frame, payload }))).toMatchObject({ ok: false, error: { code: 'MALFORMED_FRAME' } });
    }
  }
});

it('round-trips authentic purchase and auction projections and their public events', async () => {
  const { createSession, gameEngine, CURRENT_RULES_VERSION, timestamp, entropy, projectState } = await import('@game/game-core');
  const { decodeServerFrame, PROTOCOL_VERSION } = await import('../index.js');
  const session = createSession(gameEngine);
  const submit = (type: string, payload: unknown = null) => {
    const s = session.state;
    const actor = s.auction?.responder ?? s.setup?.playerId ?? s.turn?.playerId;
    const target = s.auction ? { kind: 'auctionResponse', id: s.auction.responseId } : s.setup ? { kind: 'setupRoll', id: s.setup.setupRollId } : s.turn ? { kind: 'turn', id: s.turn.turnId } : null;
    const result = session.submit({ type, payload, commandId: `projection-${s.revision}` as import('@game/game-core').CommandId,
      actor: type === 'CreateGame' || type === 'AddPlayer' || type === 'StartGame' ? { kind: 'system' } : { kind: 'player', id: actor! },
      expected: target ? { kind: 'target', target } : { kind: 'revision', revision: s.revision },
    }, { now: timestamp(1767225600000), entropy: entropy([1, 2, 3, 4]) });
    expect(result.kind).toBe('accepted');
    return result.events;
  };
  submit('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION });
  for (const playerId of ['a', 'b']) submit('AddPlayer', { playerId });
  submit('StartGame');
  for (let i = 0; i < 100 && !session.state.purchase; i++) {
    const s = session.state;
    submit(s.setup ? 'RollForOrder' : s.turn!.rolled ? 'EndTurn' : 'RollDice');
  }
  expect(session.state.purchase).not.toBeNull();
  const roundTrip = (events: readonly unknown[]) => {
    const view = projectState(session.state, { kind: 'spectator' });
    for (const frame of [
      { t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: 'a', revision: view.revision, view, history: { entries: [], chat: [] } },
      { t: 'Update', revision: view.revision, view, events },
    ]) expect(decodeServerFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
  };
  roundTrip(session.log.at(-1)!.events);
  roundTrip(submit('StartAuction'));
  expect(session.state.auction?.responseDeadline).toBe(1767225610000);
  roundTrip(submit('Bid'));
});
