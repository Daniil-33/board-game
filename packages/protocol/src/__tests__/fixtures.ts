import type { CommandId, PlayerId, Revision, StateView } from '@game/game-core';
import type { ClientFrame, ServerFrame } from '../index.js';

export const rev = (n: number) => n as Revision;
export const view = { phase: 'turns', players: [{ id: 'p1' }] } as unknown as StateView;

export const clientFrames: ClientFrame[] = [
  { t: 'Hello', protocolVersion: 1, token: 'tok.abc-123', gameId: 'room-1', lastRevision: null },
  { t: 'Hello', protocolVersion: 1, token: 'tok', gameId: 'room-1', lastRevision: rev(7) },
  { t: 'Command', commandId: 'c1' as CommandId, type: 'RollForOrder', expected: { kind: 'revision', revision: rev(0) }, payload: null },
  { t: 'Command', commandId: 'c2' as CommandId, type: 'RollDice', expected: { kind: 'target', target: { kind: 'turn', id: 't-3' } }, payload: null },
  { t: 'Command', commandId: 'c3' as CommandId, type: 'EndTurn', expected: { kind: 'revision', revision: rev(12) }, payload: null },
];

export const serverFrames: ServerFrame[] = [
  { t: 'Welcome', protocolVersion: 1, playerId: 'p1' as PlayerId, revision: rev(3), view },
  { t: 'Ack', commandId: 'c1' as CommandId, outcome: 'accepted', revision: rev(4) },
  { t: 'Ack', commandId: 'c2' as CommandId, outcome: 'rejected', revision: rev(4), error: { code: 'TARGET_MISMATCH', message: 'stale turn' } },
  { t: 'Update', revision: rev(5), view, events: [{ type: 'DiceRolled', payload: { dice: [3, 4] } }] },
  { t: 'Update', revision: rev(5), view, events: [] },
  { t: 'Error', code: 'PROTOCOL_VERSION_UNSUPPORTED', message: 'need 1' },
  { t: 'Error', code: 'NOT_A_PARTICIPANT', message: 'no' },
];
