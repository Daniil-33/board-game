type AudioContextFactory = () => AudioContext | null;
type GestureTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;
type GestureEvent = 'pointerdown' | 'pointerup' | 'keydown' | 'keyup' | 'touchend' | 'click';
const GESTURE_EVENTS: readonly GestureEvent[] = ['pointerdown', 'pointerup', 'keydown', 'keyup', 'touchend', 'click'];

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
      for (const event of GESTURE_EVENTS) target.removeEventListener(event, activate);
    };
    const activate = (event: Event): void => {
      if (context === null && (event.type === 'pointerdown' || event.type === 'keydown')) {
        context = factory();
        if (context !== null) {
          for (const gesture of GESTURE_EVENTS) {
            if (gesture !== 'pointerdown' && gesture !== 'keydown') target.addEventListener(gesture, activate);
          }
        }
      }
      if (context === null) return;
      if (context.state === 'running') { stop(); return; }
      try {
        void context.resume().then(() => {
          if (context?.state === 'running') stop();
        }).catch(() => {});
      } catch { /* Keep listening for another user gesture. */ }
    };
    for (const event of ['pointerdown', 'keydown'] as const) target.addEventListener(event, activate);
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
