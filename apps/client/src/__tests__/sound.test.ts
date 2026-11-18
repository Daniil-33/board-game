import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_IDS, createSoundEngine, type SoundEngineOptions } from '../shared/sound/index';
import { soundForEvent, createAuctionTickSoundMapper, soundForChat, soundForTokenStep } from '../entities/event/sounds';
import type { GameEvent } from '@game/game-core';
import { harness, pid, playingView, room, storedSession, update, welcome } from './helpers';

const dir = resolve(import.meta.dirname, '../shared/sound');
const manifest = JSON.parse(readFileSync(resolve(dir, 'sounds.json'), 'utf8')) as Record<string, { file: string; source: string; sourceUrl: string; license: string; author: string } | null>;
const fileIds = SOUND_IDS.filter(id => manifest[id] !== null);

describe('sound assets', () => {
  it('has metadata for every implemented file, no orphans, and CC0 clips within the size cap', () => {
    expect(Object.keys(manifest).sort()).toEqual([...SOUND_IDS].sort());
    const files = readdirSync(resolve(dir, 'files')).sort();
    expect(files).toEqual(fileIds.map(id => `${id}.mp3`).sort());
    for (const id of fileIds) {
      const item = manifest[id]!;
      expect(item).toMatchObject({ file: `./files/${id}.mp3`, source: expect.stringMatching(/^Kenney Interface Sounds \(.+\)$/), sourceUrl: 'https://kenney.nl/assets/interface-sounds', license: 'CC0', author: 'Kenney Vleugels' });
      const size = statSync(resolve(dir, item.file)).size;
      expect(size).toBeGreaterThanOrEqual(10_000);
      expect(size).toBeLessThanOrEqual(60_000);
    }
    expect(['casino', 'chance', 'jail', 'trade-offer'].every(id => manifest[id] === null)).toBe(true);
  });
});

class FakeAudioContext {
  static created = 0;
  static resumeAttempts = 0;
  static failFirstResume = false;
  static gains: Array<{ value: number }> = [];
  state: AudioContextState = 'suspended';
  constructor() { FakeAudioContext.created++; }
  destination = {} as AudioDestinationNode;
  resume = async (): Promise<void> => {
    FakeAudioContext.resumeAttempts++;
    if (FakeAudioContext.failFirstResume && FakeAudioContext.resumeAttempts === 1) throw new Error('gesture required');
    this.state = 'running';
  };
  decodeAudioData = async (): Promise<AudioBuffer> => ({} as AudioBuffer);
  createBufferSource() {
    return { buffer: null as AudioBuffer | null, connect: () => {}, start: () => {} } as unknown as AudioBufferSourceNode;
  }
  createGain() {
    const gain = { value: 1 };
    FakeAudioContext.gains.push(gain);
    return { gain, connect: () => {} } as unknown as GainNode;
  }
}
class PendingResumeAudioContext extends FakeAudioContext {
  static pending: Array<() => void> = [];
  resume: () => Promise<void> = () => new Promise(resolve => {
    PendingResumeAudioContext.pending.push(() => { this.state = 'running'; resolve(); });
  });
  static unlock(): void { for (const release of this.pending.splice(0)) release(); }
}
function makeEngine(extra: Partial<SoundEngineOptions> = {}) {
  const store = new Map<string, string>();
  let fetches = 0;
  const options: SoundEngineOptions = {
    storage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } },
    fetchFn: (async () => { fetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response; }) as typeof fetch,
    contextCtor: FakeAudioContext as unknown as NonNullable<SoundEngineOptions['contextCtor']>,
    urls: Object.fromEntries(fileIds.map(id => [`./files/${id}.mp3`, `/${id}.mp3`])),
    ...extra,
  };
  return { engine: createSoundEngine(options), store, fetchCount: () => fetches };
}

describe('sound engine', () => {
  it('drops calls before the first gesture and fetches a buffer on first use only', async () => {
    const { engine, fetchCount } = makeEngine();
    engine.playSound('dice-roll');
    expect(fetchCount()).toBe(0);
    engine.activate(); engine.playSound('dice-roll'); engine.playSound('dice-roll');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchCount()).toBe(1);
  });

  it('retries a suspended context on later user gestures without creating another context', async () => {
    FakeAudioContext.created = 0; FakeAudioContext.resumeAttempts = 0; FakeAudioContext.failFirstResume = true;
    const { engine } = makeEngine();
    const events = new EventTarget();
    engine.installGate(events as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>);
    events.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(FakeAudioContext.created).toBe(1);
    expect(FakeAudioContext.resumeAttempts).toBe(1);
    events.dispatchEvent(new Event('pointerup'));
    await Promise.resolve();
    expect(FakeAudioContext.created).toBe(1);
    expect(FakeAudioContext.resumeAttempts).toBe(2);
    events.dispatchEvent(new Event('keydown'));
    expect(FakeAudioContext.resumeAttempts).toBe(2);
    FakeAudioContext.failFirstResume = false;
  });

  it('drops playback requests while resume is pending instead of queueing stale sounds', async () => {
    PendingResumeAudioContext.pending = [];
    let fetches = 0;
    const { engine } = makeEngine({
      contextCtor: PendingResumeAudioContext as unknown as NonNullable<SoundEngineOptions['contextCtor']>,
      fetchFn: (async () => { fetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response; }) as typeof fetch,
    });
    FakeAudioContext.gains = [];
    engine.activate();
    engine.playSound('chat');
    expect(fetches).toBe(0);
    PendingResumeAudioContext.unlock();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(FakeAudioContext.gains).toHaveLength(0);
    engine.playSound('chat');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetches).toBe(1);
    expect(FakeAudioContext.gains).toHaveLength(1);
  });

  it('filters other-player sounds and attenuates allowed events by about nine decibels', async () => {
    FakeAudioContext.gains = [];
    const { engine, fetchCount } = makeEngine(); engine.activate();
    engine.playSound('token-step', { own: false }); engine.playSound('auction-bid', { own: false });
    expect(fetchCount()).toBe(0);
    engine.playSound('dice-roll', { own: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(FakeAudioContext.gains[0]?.value).toBeCloseTo(0.65 * 10 ** (-9 / 20), 4);
  });

  it('persists mute and volume, and leaves reserved slots silent', async () => {
    const { engine, store, fetchCount } = makeEngine(); engine.activate();
    engine.setMuted(true); engine.setVolume(0.3); engine.playSound('casino');
    expect(store.get('game.sound')).toBe('1:0.3');
    expect(fetchCount()).toBe(0);
    const restored = makeEngine({ storage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } } });
    expect(restored.engine.settings).toMatchObject({ muted: true, volume: 0.3 });
  });

  it('honors mute changes made while a sound buffer is still loading', async () => {
    let release!: (response: Response) => void;
    const { engine } = makeEngine({ fetchFn: (() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch });
    FakeAudioContext.gains = [];
    engine.activate(); engine.playSound('chat'); engine.setMuted(true);
    release({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(FakeAudioContext.gains).toHaveLength(0);
  });

  it('keeps defaults when storage throws and makes fetch/decode failures silent', async () => {
    const { engine } = makeEngine({ storage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }, fetchFn: (async () => { throw new Error('offline'); }) as typeof fetch });
    expect(engine.settings).toMatchObject({ muted: false, volume: 0.65 });
    engine.activate(); expect(() => engine.playSound('chat')).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('retries an id after its first fetch fails', async () => {
    let calls = 0;
    const { engine } = makeEngine({ fetchFn: (async () => {
      if (++calls === 1) throw new Error('offline');
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response;
    }) as typeof fetch });
    engine.activate(); engine.playSound('chat');
    await new Promise(resolve => setTimeout(resolve, 0));
    engine.playSound('chat');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toBe(2);
  });
});

describe('event sound mapping', () => {
  const event = (type: string, payload: unknown): GameEvent => ({ type, payload });
  it.each([
    ['TurnStarted', { playerId: 'a' }, 'turn-start', true],
    ['TurnEnded', { playerId: 'a', reason: 'timeout' }, 'turn-timeout', true],
    ['DiceRolled', { playerId: 'b', double: true }, 'dice-double', false],
    ['AssetPurchased', { playerId: 'b' }, 'purchase', false],
    ['BalanceChanged', { playerId: 'a', delta: 50 }, 'money-in', true],
    ['AuctionBid', { playerId: 'a' }, 'auction-bid', true],
    ['AuctionWon', { playerId: 'b' }, 'auction-win', false],
    ['HouseBuilt', { playerId: 'a' }, 'house-built', true],
    ['AssetMortgaged', { playerId: 'a' }, 'asset-mortgaged', true],
    ['PlayerBankrupt', { playerId: 'b' }, 'bankrupt', false],
    ['GameEnded', { winner: 'b' }, 'victory', false],
  ])('%s maps to %s with ownership %s', (type, payload, id, own) => {
    expect(soundForEvent(event(type, payload), 'a')).toEqual({ id, own });
  });
  it('does not map history-only events or an unrelated turn start', () => {
    expect(soundForEvent(event('PlayerMoved', { playerId: 'a' }), 'a')).toBeNull();
    expect(soundForEvent(event('TurnStarted', { playerId: 'b' }), 'a')).toBeNull();
  });

  it('maps live chat, final auction seconds and reduced-motion movement centrally', () => {
    const auctionTick = createAuctionTickSoundMapper();
    expect(soundForChat('b', 'a')).toEqual({ id: 'chat', own: false });
    expect(soundForChat('a', 'a')).toBeNull();
    expect(auctionTick('auction-1', 'response-1', 3, 'a', 'a')).toEqual({ id: 'auction-tick', own: true });
    expect(auctionTick('auction-1', 'response-1', 3, 'a', 'a')).toBeNull();
    expect(auctionTick('auction-1', 'response-1', 2, 'a', 'a')).toEqual({ id: 'auction-tick', own: true });
    expect(auctionTick('auction-1', 'response-1', 4, 'a', 'a')).toBeNull();
    expect(auctionTick('auction-1', 'response-2', 3, 'b', 'a')).toEqual({ id: 'auction-tick', own: false });
    expect(soundForTokenStep('a', 'a', false)).toEqual({ id: 'token-step', own: true });
    expect(soundForTokenStep('a', 'a', true)).toBeNull();
  });

  it('keeps Welcome history silent and plays the matching live Update event', () => {
    const played: Array<{ id: string; own?: boolean }> = [];
    const h = harness({
      stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])),
      sound: (id, opts) => { played.push({ id, ...opts }); },
    });
    h.client.start();
    const socket = h.sockets.last(); socket.open();
    const first = playingView(['a', 'b']);
    const initial = welcome(first);
    socket.receive({ ...initial, history: { entries: [{ revision: first.revision, at: 1, events: [{ type: 'TurnStarted', payload: { playerId: 'a' } }] }], chat: [{ seq: 1, authorId: 'b', text: 'History only', at: 2 }] } } as Parameters<typeof socket.receive>[0]);
    expect(played).toEqual([]);
    const next = playingView(['a', 'b'], { revision: 10 });
    socket.receive(update(next, [{ type: 'TurnStarted', payload: { playerId: 'a' } }]));
    expect(played).toEqual([{ id: 'turn-start', own: true }]);
    socket.receive({ t: 'Chat', message: { seq: 2, authorId: pid('a'), text: 'Own message', at: 3 } });
    expect(played).toEqual([{ id: 'turn-start', own: true }]);
    socket.receive({ t: 'Chat', message: { seq: 3, authorId: pid('b'), text: 'Other message', at: 4 } });
    expect(played).toEqual([{ id: 'turn-start', own: true }, { id: 'chat', own: false }]);
  });
});
