import { reactive } from 'vue';
import { getShellAudioContext } from '../audio-context/index';

export const SOUND_IDS = [
  'dice-roll', 'dice-double', 'token-step', 'purchase', 'money-in', 'money-out',
  'auction-bid', 'auction-tick', 'auction-win', 'turn-start', 'turn-timeout',
  'house-built', 'asset-mortgaged', 'bankrupt', 'victory', 'chat',
  'casino', 'chance', 'jail', 'trade-offer',
] as const;
export type SoundId = typeof SOUND_IDS[number];
export interface SoundSettings { muted: boolean; volume: number }
const allowedForOthers = new Set<SoundId>(['dice-roll', 'dice-double', 'purchase', 'auction-win', 'bankrupt', 'victory', 'chat']);
const urls = import.meta.glob('./files/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const storedKey = 'game.sound';

type AudioContextCtor = new () => AudioContext;
export interface SoundEngineOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  fetchFn?: typeof fetch;
  contextCtor?: AudioContextCtor;
  contextProvider?: () => AudioContext | null;
  urls?: Record<string, string>;
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export function createSoundEngine(options: SoundEngineOptions = {}) {
  const settings = reactive<SoundSettings>({ muted: false, volume: 0.65 });
  const storage = options.storage ?? browserStorage();
  const fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis);
  const contextCtor = options.contextCtor ?? (typeof window !== 'undefined' ? window.AudioContext : undefined);
  const contextProvider = options.contextProvider ?? (() => null);
  const files = options.urls ?? urls;
  let context: AudioContext | null = contextProvider();
  const decoded = new Map<SoundId, Promise<AudioBuffer | null>>();

  function resumeContext(audio: AudioContext): Promise<boolean> {
    if (audio.state === 'running') return Promise.resolve(true);
    try { return audio.resume().then(() => audio.state === 'running').catch(() => false); }
    catch { return Promise.resolve(false); }
  }

  try {
    const stored = storage?.getItem(storedKey);
    if (stored) {
      const [muted, volume] = stored.split(':');
      if (muted === '0' || muted === '1') settings.muted = muted === '1';
      const parsedVolume = Number(volume);
      if (volume !== undefined && Number.isFinite(parsedVolume)) settings.volume = Math.max(0, Math.min(1, parsedVolume));
    }
  } catch { /* Storage can be unavailable or contain stale data. */ }

  function persist(): void {
    try { storage?.setItem(storedKey, `${settings.muted ? '1' : '0'}:${settings.volume}`); } catch { /* Settings remain usable for this page. */ }
  }
  function setMuted(muted: boolean): void { settings.muted = muted; persist(); }
  function setVolume(volume: number): void {
    if (Number.isFinite(volume)) { settings.volume = Math.max(0, Math.min(1, volume)); persist(); }
  }
  function activate(): void {
    if (context === null && contextCtor !== undefined) {
      try { context = new contextCtor(); } catch { context = null; }
    }
    if (context !== null && context.state !== 'running') void resumeContext(context);
  }
  function currentContext(): AudioContext | null {
    if (context === null) context = contextProvider();
    return context;
  }
  async function buffer(id: SoundId): Promise<AudioBuffer | null> {
    const url = files[`./files/${id}.mp3`];
    const audioContext = currentContext();
    if (!url || !fetchFn || !audioContext) return null;
    let pending = decoded.get(id);
    if (!pending) {
      const attempt = (async () => {
        try {
          const response = await fetchFn(url);
          if (!response.ok) return null;
          return await audioContext.decodeAudioData(await response.arrayBuffer());
        } catch { return null; }
      })();
      pending = attempt.then((audio) => {
        if (audio === null && decoded.get(id) === pending) decoded.delete(id);
        return audio;
      });
      decoded.set(id, pending);
    }
    return pending;
  }
  function playSound(id: SoundId, opts: { own?: boolean } = {}): void {
    const activeContext = currentContext();
    if (!activeContext || settings.muted || settings.volume <= 0) return;
    if (opts.own === false && !allowedForOthers.has(id)) return;
    if (activeContext.state !== 'running') {
      void resumeContext(activeContext);
      return;
    }
    void buffer(id).then((audio) => {
      if (!audio || context !== activeContext || activeContext.state !== 'running' || settings.muted || settings.volume <= 0) return;
      try {
        const source = activeContext.createBufferSource();
        const node = activeContext.createGain();
        source.buffer = audio;
        node.gain.value = settings.volume * (opts.own === false ? 10 ** (-9 / 20) : 1);
        source.connect(node); node.connect(activeContext.destination); source.start();
      } catch { /* Audio output failures stay silent. */ }
    });
  }
  return { settings, setMuted, setVolume, activate, playSound };
}

const engine = createSoundEngine({ contextProvider: getShellAudioContext });
export const soundSettings = engine.settings;
export const playSound = engine.playSound;
export const setSoundMuted = engine.setMuted;
export const setSoundVolume = engine.setVolume;
export { default as SoundControls } from './SoundControls.vue';
