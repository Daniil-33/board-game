import { describe, it, expect } from 'vitest';
import { gameEngine } from '../rules.js';
import { createSession } from '../session.js';
import { cmd, ctx, lobbyState, deepFreeze } from './helpers/fixtures.js';

const REV = 3;
const add = (opts: Parameters<typeof cmd>[2]) => cmd('AddPlayer', { playerId: 'c' }, opts);

function expectRejected(opts: Parameters<typeof cmd>[2], code: string) {
  const s = deepFreeze(lobbyState(REV));
  const r = gameEngine.execute(s, add(opts), ctx());
  expect(r.kind).toBe('rejected');
  if (r.kind === 'rejected') expect(r.error.code).toBe(code);
  expect(r.state).toBe(s);
}

describe('revision guard', () => {
  it('lifecycle AddPlayer with rev - 1 is REVISION_MISMATCH', () => {
    expectRejected({ rev: REV - 1 }, 'REVISION_MISMATCH');
  });

  it('a target expectation on a revision-guarded command is REVISION_MISMATCH', () => {
    expectRejected({ target: { kind: 'turn', id: 't1' } }, 'REVISION_MISMATCH');
  });

  it.each([
    ['null', null],
    ['a revision expectation without a revision', { kind: 'revision' }],
    ['a bare number', REV],
    ['a string revision', { kind: 'revision', revision: String(REV) }],
  ])('malformed expected (%s) is REVISION_MISMATCH and does not throw', (_l, expected) => {
    expectRejected({ expected }, 'REVISION_MISMATCH');
  });

  it('the matching revision expectation is accepted', () => {
    const r = gameEngine.execute(lobbyState(REV), add({ rev: REV }), ctx());
    expect(r.kind).toBe('accepted');
  });
});

describe('fingerprint uses expected', () => {
  it('the same commandId with a different expected is COMMAND_ID_CONFLICT', () => {
    const s = createSession(gameEngine);
    const first = s.submit(cmd('CreateGame', { seed: 1, rulesVersion: 'core-4' }, { id: 'k', rev: 0 }), ctx());
    expect(first.kind).toBe('accepted');
    const again = s.submit(
      cmd('CreateGame', { seed: 1, rulesVersion: 'core-4' }, { id: 'k', target: { kind: 'turn', id: 't' } }),
      ctx(),
    );
    expect(again.kind).toBe('rejected');
    if (again.kind === 'rejected') expect(again.error.code).toBe('COMMAND_ID_CONFLICT');
  });
});
