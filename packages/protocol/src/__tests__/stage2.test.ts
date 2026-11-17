import { expect, it } from 'vitest';
import { createSession, gameEngine, CURRENT_RULES_VERSION, projectState, timestamp, entropy, type GameCommand, type CommandId } from '@game/game-core';
import { decodeServerFrame, PROTOCOL_VERSION, type ServerFrame } from '../index.js';

it('round-trips a real stage 2 projection and public money/board events', () => {
  const session = createSession(gameEngine);
  const events = [];
  for (const [type, payload] of [
    ['CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION }],
    ['AddPlayer', { playerId: 'a' }], ['AddPlayer', { playerId: 'b' }], ['StartGame', null],
  ] as const) {
    const command: GameCommand = { type, payload, commandId: type + session.state.revision as CommandId, actor: { kind: 'system' }, expected: { kind: 'revision', revision: session.state.revision } };
    const result = session.submit(command, { now: timestamp(1767225600000), entropy: entropy([1, 2, 3, 4]) });
    expect(result.kind).toBe('accepted');
    events.push(...result.events);
  }
  const view = projectState(session.state, { kind: 'spectator' });
  expect(view.board?.cells).toHaveLength(40);
  expect(view.balances).toEqual({ a: 29910, b: 29910 });
  expect(view.economy).toEqual({ startingCapital: 29910, lapReward: 3980 });
  expect(events.some(e => e.type === 'BoardGenerated')).toBe(true);
  expect(events.filter(e => e.type === 'BalanceChanged')).toHaveLength(2);
  const frames: ServerFrame[] = [
    { t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: session.state.players[0]!.id, revision: session.state.revision, view, history: { entries: [], chat: [] } },
    { t: 'Update', revision: session.state.revision, view, events },
  ];
  for (const frame of frames) expect(decodeServerFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
});
