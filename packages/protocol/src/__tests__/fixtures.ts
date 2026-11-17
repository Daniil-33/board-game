import type { CommandId, PlayerId, Revision, StateView } from '@game/game-core';
import { PROTOCOL_VERSION } from '../index.js';
import type { ClientFrame, ServerFrame } from '../index.js';

export const rev = (n: number) => n as Revision;
export const view = { phase: 'turns', players: [{ id: 'p1' }] } as unknown as StateView;

export const clientFrames: ClientFrame[] = [
  { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: 'tok.abc-123', gameId: 'room-1', lastRevision: null },
  { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: 'tok', gameId: 'room-1', lastRevision: rev(7) },
  { t: 'Command', commandId: 'c1' as CommandId, type: 'RollForOrder', expected: { kind: 'revision', revision: rev(0) }, payload: null },
  { t: 'Command', commandId: 'c2' as CommandId, type: 'RollDice', expected: { kind: 'target', target: { kind: 'turn', id: 't-3' } }, payload: null },
  { t: 'Command', commandId: 'c3' as CommandId, type: 'EndTurn', expected: { kind: 'revision', revision: rev(12) }, payload: null },
  { t: 'Command', commandId: 'c1' as CommandId, type: 'Resign', expected: { kind: 'revision', revision: rev(7) }, payload: null },
  { t: 'ChatSend', clientMsgId: 'm1', text: 'hello' },
  { t: 'ChatSend', clientMsgId: 'm2', text: '' },
];

export const history = {
  entries: [
    { revision: rev(2), at: 1_000, events: [{ type: 'DiceRolled', payload: { dice: [1, 2] } }] },
    { revision: rev(3), at: 1_500, events: [{ type: 'TurnEnded', payload: null }] },
  ],
  chat: [{ seq: 1, authorId: 'p1' as PlayerId, text: 'hi\nthere', at: 1_200 }],
};

export const serverFrames: ServerFrame[] = [
  { t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: 'p1' as PlayerId, revision: rev(3), view, history },
  { t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: 'p1' as PlayerId, revision: rev(0), view, history: { entries: [], chat: [] } },
  { t: 'Ack', commandId: 'c1' as CommandId, outcome: 'accepted', revision: rev(4) },
  { t: 'Ack', commandId: 'c2' as CommandId, outcome: 'rejected', revision: rev(4), error: { code: 'TARGET_MISMATCH', message: 'stale turn' } },
  { t: 'Update', revision: rev(5), view, events: [{ type: 'DiceRolled', payload: { dice: [3, 4] } }] },
  { t: 'Update', revision: rev(5), view, events: [] },
  { t: 'Error', code: 'PROTOCOL_VERSION_UNSUPPORTED', message: 'need 1' },
  { t: 'Error', code: 'NOT_A_PARTICIPANT', message: 'no' },
  { t: 'Error', code: 'ROOM_CLOSED', message: 'closed' },
  { t: 'Error', code: 'CONNECTION_REPLACED', message: 'replaced' },
  { t: 'Chat', message: { seq: 7, authorId: 'p2' as PlayerId, text: 'gg 😀', at: 0 } },
  { t: 'ChatAck', clientMsgId: 'm1', ok: true },
  { t: 'ChatAck', clientMsgId: 'm2', ok: false, reason: 'EMPTY' },
  { t: 'ChatAck', clientMsgId: 'm3', ok: false, reason: 'RATE_LIMITED' },
];
