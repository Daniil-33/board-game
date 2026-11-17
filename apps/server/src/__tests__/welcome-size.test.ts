import { describe, expect, it } from 'vitest';
import {
  entropy,
  gameEngine,
  restoreSession,
  timestamp,
  type CommandId,
  type GameCommand,
  type LogEntry,
  type PlayerId,
  type Revision,
} from '@game/game-core';
import { CHAT_LIMITS, MAX_FRAME_LENGTH, decodeServerFrame } from '@game/protocol';
import type { StoredHistory } from '../db/game-store.js';
import { buildFixture, STAGE5_FIXTURE_NAMES } from '../test-fixtures.js';
import { welcomeFrame } from '../ws/connection.js';

const NOW = 1_767_225_600_000;
const IDS = ['g1', 'g2', 'g3'];

/** Play a stage 5 fixture forward (rent, liquidation, bankruptcy, auctions) and keep its log entries. */
function playFixture(name: (typeof STAGE5_FIXTURE_NAMES)[number], steps = 60): readonly LogEntry[] {
  const session = restoreSession(gameEngine, buildFixture(name, IDS, NOW), []);
  for (let i = 0; i < steps && session.state.phase === 'playing'; i++) {
    const { turn, auction, purchase } = session.state;
    const types = auction ? ['PassAuction'] : purchase ? ['StartAuction'] : ['PayRent', 'RollDice', 'EndTurn'];
    const accepted = types.some((type) => {
      const command = {
        type,
        commandId: `c${i}-${type}` as CommandId,
        actor: { kind: 'player', id: auction ? auction.responder : turn!.playerId },
        expected: { kind: 'target', target: auction ? { kind: 'auctionResponse', id: auction.responseId } : { kind: 'turn', id: turn!.turnId } },
        payload: null,
      } as GameCommand;
      return session.submit(command, { now: timestamp(NOW + 1000 * i), entropy: entropy([i + 1, 2, 3, 4]) }).kind === 'accepted';
    });
    if (!accepted) break;
  }
  return session.log;
}

const size = (value: unknown): number => JSON.stringify(value).length;

// spec: server/chat "Welcome history" (frame size, RVW-003)
describe('Welcome size', () => {
  it('the heaviest stage 5 Welcome with 200 entries and 200 max-length messages stays under half the client limit', () => {
    // The heaviest real log entry any stage 5 fixture produces, and the largest view.
    let heaviest: LogEntry | null = null;
    let fixture: (typeof STAGE5_FIXTURE_NAMES)[number] = STAGE5_FIXTURE_NAMES[0];
    for (const name of STAGE5_FIXTURE_NAMES) {
      for (const entry of playFixture(name)) {
        if (heaviest === null || size(entry.events) > size(heaviest.events)) heaviest = entry;
      }
      if (size(buildFixture(name, IDS, NOW)) > size(buildFixture(fixture, IDS, NOW))) fixture = name;
    }
    expect(heaviest!.events.some((e) => e.type === 'LiquidationApplied')).toBe(true);
    const state = buildFixture(fixture, IDS, NOW);

    const history: StoredHistory = {
      entries: Array.from({ length: CHAT_LIMITS.historySize }, (_, i) => ({ ...heaviest!, revision: (i + 1) as Revision })),
      // 300 astral code points: 600 UTF-16 units, the longest text a message can hold.
      chat: Array.from({ length: CHAT_LIMITS.historySize }, (_, i) => ({
        seq: i + 1,
        authorId: IDS[i % 3]!,
        text: '😀'.repeat(CHAT_LIMITS.maxCodePoints),
        at: NOW + i,
      })),
    };
    const frame = welcomeFrame(state, { kind: 'player', id: 'g1' as PlayerId }, history);
    const text = JSON.stringify(frame);
    expect(frame.history.entries).toHaveLength(200);
    expect(frame.history.chat).toHaveLength(200);
    // Measured 395,238 of 1,048,576 UTF-16 units (final-bankruptcy view, liquidation-multi-tier entry).
    expect(text.length).toBeLessThan(MAX_FRAME_LENGTH / 2);
    expect(decodeServerFrame(text).ok).toBe(true);
  });

});
