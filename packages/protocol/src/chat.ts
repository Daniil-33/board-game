/** Chat text limits shared by server and client. */
export const CHAT_LIMITS = {
  /** Unicode code points after trimming. */
  maxCodePoints: 300,
  maxLines: 4,
  /** Accepted messages per author within `windowMs`. */
  maxPerWindow: 5,
  windowMs: 10_000,
  /** Minimum time between two accepted messages of one author. */
  minIntervalMs: 500,
  /** Messages and log entries carried by `Welcome.history`. */
  historySize: 200,
} as const;

/** Technical bound on `ChatSend.text` in UTF-16 units; longer frames are malformed. */
export const MAX_CHAT_FRAME_TEXT = 4096;

/** Reasons a `ChatSend` is rejected, as carried by `ChatAck.reason`. */
export const CHAT_REJECT_REASONS = [
  'NOT_A_MEMBER',
  'EMPTY',
  'TOO_LONG',
  'CONTROL_CHARACTER',
  'TOO_MANY_LINES',
  'TOO_FAST',
  'RATE_LIMITED',
  'ROOM_UNAVAILABLE',
  'PERSISTENCE_FAILED',
] as const;
export type ChatRejectReason = (typeof CHAT_REJECT_REASONS)[number];

export type ChatTextReason = Extract<ChatRejectReason, 'EMPTY' | 'TOO_LONG' | 'CONTROL_CHARACTER' | 'TOO_MANY_LINES'>;

export type ChatTextCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: ChatTextReason };

// Every control character except newline, and any lone surrogate.
const FORBIDDEN = /(?!\n)\p{Cc}|\p{Cs}/u;

/**
 * Trims `raw` and checks it as a chat message: 1-300 code points, no control
 * character other than newline, no lone surrogate, at most 4 lines.
 */
export function checkChatText(raw: string): ChatTextCheck {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: 'EMPTY' };
  // Cheap bound first: a code point is at most 2 UTF-16 units.
  if (text.length > CHAT_LIMITS.maxCodePoints && [...text].length > CHAT_LIMITS.maxCodePoints) {
    return { ok: false, reason: 'TOO_LONG' };
  }
  if (FORBIDDEN.test(text)) return { ok: false, reason: 'CONTROL_CHARACTER' };
  if (text.split('\n').length > CHAT_LIMITS.maxLines) return { ok: false, reason: 'TOO_MANY_LINES' };
  return { ok: true, text };
}
