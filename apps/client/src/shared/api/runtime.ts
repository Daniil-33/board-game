import type { FetchLike } from './lobby';
import { socketUrl } from './routes';

declare global {
  interface Window {
    __GAME_CONFIG__?: { API_ORIGIN?: string };
  }
}

/** Runtime selection lives at browser composition; route contracts stay relative. */
export function runtimeApi(location: Pick<Location, 'protocol' | 'host'>, apiOrigin = '') {
  return {
    socketUrl: socketUrl(apiOrigin ? new URL(apiOrigin) : location),
    fetch: (fetchFn: FetchLike): FetchLike => (path, init) =>
      fetchFn(`${apiOrigin}${path}`, apiOrigin ? { ...init, credentials: 'omit' } : init),
  };
}
