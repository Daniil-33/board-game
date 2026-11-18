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
    let disposed = false;
    let listening = false;
    const disarm = (): void => {
      if (!listening) return;
      listening = false;
      for (const event of GESTURE_EVENTS) target.removeEventListener(event, activate);
    };
    const arm = (): void => {
      if (disposed || listening) return;
      listening = true;
      for (const event of GESTURE_EVENTS) target.addEventListener(event, activate);
    };
    const stop = (): void => {
      if (disposed) return;
      disposed = true;
      disarm();
      context?.removeEventListener('statechange', onStateChange);
    };
    const onStateChange = (): void => {
      if (context?.state === 'running') disarm();
      else arm();
    };
    const activate = (event: Event): void => {
      if (context === null && (event.type === 'pointerdown' || event.type === 'keydown')) {
        context = factory();
        context?.addEventListener('statechange', onStateChange);
      }
      if (context === null) return;
      if (context.state === 'running') { disarm(); return; }
      arm();
      try {
        void context.resume().then(() => {
          onStateChange();
        }).catch(() => {});
      } catch { /* Keep listening for another user gesture. */ }
    };
    arm();
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
