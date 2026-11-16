import { describe, it, expect } from 'vitest';
import { createSession } from '../session.js';
import { gameEngine } from '../rules.js';
import { genesis } from '../state.js';
import { cmd, ctx, player } from './helpers/fixtures.js';

const create = (id = 'c-create') => cmd('CreateGame', { seed: 42, rulesVersion: 'core-5' }, { id, rev: 0 });
const add = (playerId: string, rev: number, id = `c-add-${playerId}`) =>
  cmd('AddPlayer', { playerId }, { id, rev });

describe('session holds current state', () => {
  it('starts from genesis with an empty log', () => {
    const s = createSession(gameEngine);
    expect(s.state).toEqual(genesis());
    expect(s.log).toEqual([]);
  });

  it('accepted command advances the session', () => {
    const s = createSession(gameEngine);
    const r = s.submit(create(), ctx());
    expect(r.kind).toBe('accepted');
    expect(s.state).toBe(r.state);
  });

  it('rejected command leaves the session state reference-equal', () => {
    const s = createSession(gameEngine);
    const before = s.state;
    const r = s.submit(add('a', 0), ctx()); // AddPlayer before CreateGame
    expect(r.kind).toBe('rejected');
    expect(s.state).toBe(before);
  });
});

describe('accepted-command log', () => {
  it('logs only accepted commands, in order, with revisions 1 and 2', () => {
    const s = createSession(gameEngine);
    s.submit(create(), ctx(1000));
    s.submit(add('a', 0), ctx(2000)); // stale revision -> rejected
    s.submit(add('a', 1), ctx(3000));
    expect(s.log).toHaveLength(2);
    expect(s.log.map((e) => e.revision)).toEqual([1, 2]);
    expect(s.log.map((e) => e.command.type)).toEqual(['CreateGame', 'AddPlayer']);
  });

  it('entry records command, time, revision and events', () => {
    const s = createSession(gameEngine);
    const c = create();
    const r = s.submit(c, ctx(5000));
    const e = s.log[0]!;
    expect(e.command).toEqual(c);
    expect(e.now).toBe(5000);
    expect(e.revision).toBe(1);
    expect(e.events).toEqual(r.events);
  });

  it('later mutation of the submitted payload does not corrupt the log', () => {
    const s = createSession(gameEngine);
    const c = create();
    s.submit(c, ctx());
    (c.payload as { seed: number }).seed = 7;
    expect((s.log[0]!.command.payload as { seed: number }).seed).toBe(42);
  });
});

describe('deduplication by commandId', () => {
  it('duplicate delivery returns the original result without re-executing', () => {
    const s = createSession(gameEngine);
    const first = s.submit(create(), ctx(1000));
    const stateAfter = s.state;
    const again = s.submit(create(), ctx(9999));
    expect(again).toBe(first);
    expect(again.revision).toBe(1);
    expect(s.log).toHaveLength(1);
    expect(s.state).toBe(stateAfter);
  });

  it('duplicate is recognised after later commands too', () => {
    const s = createSession(gameEngine);
    const first = s.submit(create(), ctx());
    s.submit(add('a', 1), ctx());
    expect(s.submit(create(), ctx())).toBe(first);
    expect(s.state.revision).toBe(2);
  });

  it('payload key order is irrelevant to the fingerprint', () => {
    const s = createSession(gameEngine);
    const first = s.submit(cmd('CreateGame', { seed: 42, rulesVersion: 'core-5' }, { id: 'k', rev: 0 }), ctx());
    const again = s.submit(cmd('CreateGame', { rulesVersion: 'core-5', seed: 42 }, { id: 'k', rev: 0 }), ctx());
    expect(again).toBe(first);
  });

  it('same id, different payload -> COMMAND_ID_CONFLICT, nothing changes', () => {
    const s = createSession(gameEngine);
    s.submit(create('dup'), ctx());
    const before = s.state;
    const r = s.submit(cmd('CreateGame', { seed: 43, rulesVersion: 'core-5' }, { id: 'dup', rev: 0 }), ctx());
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.error.code).toBe('COMMAND_ID_CONFLICT');
    expect(s.state).toBe(before);
    expect(s.log).toHaveLength(1);
  });

  it('same id, different actor -> COMMAND_ID_CONFLICT', () => {
    const s = createSession(gameEngine);
    s.submit(create('dup'), ctx());
    const r = s.submit(
      cmd('CreateGame', { seed: 42, rulesVersion: 'core-5' }, { id: 'dup', rev: 0, actor: player('a') }),
      ctx(),
    );
    expect(r.kind === 'rejected' && r.error.code).toBe('COMMAND_ID_CONFLICT');
  });

  it('a rejected commandId is not reserved: retry with fixed revision executes', () => {
    const s = createSession(gameEngine);
    s.submit(create(), ctx());
    const bad = s.submit(add('a', 0, 'retry'), ctx());
    expect(bad.kind === 'rejected' && bad.error.code).toBe('REVISION_MISMATCH');
    const good = s.submit(add('a', 1, 'retry'), ctx());
    expect(good.kind).toBe('accepted');
    expect(s.log).toHaveLength(2);
  });
});

describe('payload must be plain data', () => {
  it.each([
    ['function', { f: () => 1 }],
    ['undefined field', { seed: undefined, rulesVersion: 'core-5' }],
    ['NaN', { seed: NaN, rulesVersion: 'core-5' }],
    ['Infinity', { seed: Infinity, rulesVersion: 'core-5' }],
  ])('%s -> INVALID_PAYLOAD at the session', (_n, payload) => {
    const s = createSession(gameEngine);
    const r = s.submit(cmd('CreateGame', payload, { rev: 0 }), ctx());
    expect(r.kind === 'rejected' && r.error.code).toBe('INVALID_PAYLOAD');
    expect(s.log).toHaveLength(0);
  });
});
