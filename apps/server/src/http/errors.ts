/**
 * An error answered as `{ code, message }` with `statusCode`. The message is
 * written by the server and never echoes request input (codes, tokens).
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const unauthenticated = (): ApiError => new ApiError(401, 'UNAUTHENTICATED', 'A valid guest token is required');
export const roomNotFound = (): ApiError => new ApiError(404, 'ROOM_UNAVAILABLE', 'The room does not exist');
export const roomClosed = (): ApiError => new ApiError(409, 'ROOM_CLOSED', 'The room was closed');
export const roomUnavailable = (): ApiError => new ApiError(503, 'ROOM_UNAVAILABLE', 'The room is unavailable');
export const notParticipant = (): ApiError => new ApiError(403, 'NOT_A_PARTICIPANT', 'You are not a member of this room');

/** Room and persistence codes are server trouble (503); every other rejection is an engine rule (409). */
const SERVER_SIDE = new Set(['ROOM_UNAVAILABLE', 'PERSISTENCE_FAILED']);

/** The HTTP answer for a command the room rejected; engine codes pass through unchanged. */
export function rejection(error: { readonly code: string; readonly message: string }): ApiError {
  return new ApiError(SERVER_SIDE.has(error.code) ? 503 : 409, error.code, error.message);
}
