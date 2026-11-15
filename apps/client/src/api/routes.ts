/**
 * Every server route the client uses, in one place. The mock server imports
 * the same table. Routes are the ones the Team Lead fixed for the server-api
 * task; payloads are the `@game/protocol` lobby schemas.
 */
export const ROUTES = {
  /** POST: guest login. */
  guests: '/api/guests',
  /** POST: create room. GET: list joinable rooms. */
  rooms: '/api/rooms',
  /** POST: join room. */
  joinRoom: (roomId: string): string => `/api/rooms/${encodeURIComponent(roomId)}/join`,
  /** POST: start game (creator only). */
  startGame: (roomId: string): string => `/api/rooms/${encodeURIComponent(roomId)}/start`,
  /** GET with WebSocket upgrade: the game socket. */
  socket: '/ws',
} as const;

/** Same-origin WebSocket URL of the game socket. */
export function socketUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${ROUTES.socket}`;
}
