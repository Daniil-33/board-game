import { reactive } from 'vue';

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
  urls?: Record<string, string>;
}
type GestureTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export function createSoundEngine(options: SoundEngineOptions = {}) {
  const settings = reactive<SoundSettings>({ muted: false, volume: 0.65 });
  const storage = options.storage ?? browserStorage();
  const fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis);
  const contextCtor = options.contextCtor ?? (typeof window !== 'undefined' ? window.AudioContext : undefined);
  const files = options.urls ?? urls;
  let context: AudioContext | null = null;
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
  function installGate(target: GestureTarget): () => void {
    const stop = (): void => {
      target.removeEventListener('pointerdown', firstGesture);
      target.removeEventListener('keydown', firstGesture);
      target.removeEventListener('pointerup', retryGesture);
      target.removeEventListener('keyup', retryGesture);
      target.removeEventListener('touchend', retryGesture);
      target.removeEventListener('click', retryGesture);
    };
    const firstGesture = (): void => {
      activate();
      if (context?.state === 'running') stop();
    };
    const retryGesture = (): void => {
      if (context === null) return;
      activate();
      if (context.state === 'running') stop();
    };
    target.addEventListener('pointerdown', firstGesture);
    target.addEventListener('keydown', firstGesture);
    target.addEventListener('pointerup', retryGesture);
    target.addEventListener('keyup', retryGesture);
    target.addEventListener('touchend', retryGesture);
    target.addEventListener('click', retryGesture);
    return stop;
  }
  async function buffer(id: SoundId): Promise<AudioBuffer | null> {
    const url = files[`./files/${id}.mp3`];
    if (!url || !fetchFn || !context) return null;
    let pending = decoded.get(id);
    if (!pending) {
      const attempt = (async () => {
        try {
          const response = await fetchFn(url);
          if (!response.ok) return null;
          return await context!.decodeAudioData(await response.arrayBuffer());
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
    if (!context || settings.muted || settings.volume <= 0) return;
    if (opts.own === false && !allowedForOthers.has(id)) return;
    const activeContext = context;
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
  return { settings, setMuted, setVolume, activate, installGate, playSound };
}

const engine = createSoundEngine();
export const soundSettings = engine.settings;
export const playSound = engine.playSound;
export function installSoundGate(target: GestureTarget = window): () => void {
  return engine.installGate(target);
}
export const setSoundMuted = engine.setMuted;
export const setSoundVolume = engine.setVolume;
export { default as SoundControls } from './SoundControls.vue';
