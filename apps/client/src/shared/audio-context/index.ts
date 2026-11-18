type AudioContextFactory = () => AudioContext | null;
type GestureTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

function browserAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  try { return new window.AudioContext(); } catch { return null; }
}

/** Small shell gate. The sound engine and audio assets remain in the lazy game chunk. */
export function createAudioGestureGate(factory: AudioContextFactory = browserAudioContext) {
  let context: AudioContext | null = null;

  function getContext(): AudioContext | null { return context; }

  function install(target: GestureTarget): () => void {
    let active = true;
    const stop = (): void => {
      if (!active) return;
      active = false;
      target.removeEventListener('pointerdown', activate);
      target.removeEventListener('keydown', activate);
    };
    const activate = (): void => {
      if (context === null) context = factory();
      if (context === null) return;
      if (context.state === 'running') { stop(); return; }
      try {
        void context.resume().then(() => {
          if (context?.state === 'running') stop();
        }).catch(() => {});
      } catch { /* Keep listening for another user gesture. */ }
    };
    target.addEventListener('pointerdown', activate);
    target.addEventListener('keydown', activate);
    return stop;
  }

  return { getContext, install };
}

const shellGate = createAudioGestureGate();

export function installAudioGestureGate(target: GestureTarget = window): () => void {
  return shellGate.install(target);
}

export function getShellAudioContext(): AudioContext | null {
  return shellGate.getContext();
}
