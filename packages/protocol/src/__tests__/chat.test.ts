import { describe, expect, it } from 'vitest';
import {
  CHAT_LIMITS,
  CHAT_REJECT_REASONS,
  checkChatText,
  decodeClientFrame,
  decodeServerFrame,
} from '../index.js';
import { history, rev, view } from './fixtures.js';

const enc = (v: unknown) => JSON.stringify(v);
const isMalformed = (r: { ok: boolean; error?: { code: string } }) => !r.ok && r.error?.code === 'MALFORMED_FRAME';
const welcome = { t: 'Welcome', protocolVersion: 6, playerId: 'p1', revision: rev(3), view, history };

describe('checkChatText', () => {
  it('trims and returns the text', () => {
    expect(checkChatText('  hi\nthere  ')).toEqual({ ok: true, text: 'hi\nthere' });
  });

  it.each([
    ['only spaces', '   ', 'EMPTY'],
    ['empty', '', 'EMPTY'],
    ['only newlines', '\n\n', 'EMPTY'],
    ['301 code points', 'x'.repeat(301), 'TOO_LONG'],
    ['301 astral code points', '😀'.repeat(301), 'TOO_LONG'],
    ['a tab', 'a\tb', 'CONTROL_CHARACTER'],
    ['a carriage return', 'a\r\nb', 'CONTROL_CHARACTER'],
    ['NUL', 'a\u0000', 'CONTROL_CHARACTER'],
    ['DEL', 'a\u007f', 'CONTROL_CHARACTER'],
    ['a lone surrogate', 'a\ud800b', 'CONTROL_CHARACTER'],
    ['five lines', 'a\nb\nc\nd\ne', 'TOO_MANY_LINES'],
    ['five lines with an empty one', 'a\n\nc\nd\ne', 'TOO_MANY_LINES'],
  ])('%s', (_name, text, reason) => {
    expect(checkChatText(text)).toEqual({ ok: false, reason });
  });

  it.each([
    ['300 code points', 'x'.repeat(300)],
    ['300 astral code points (600 UTF-16 units)', '😀'.repeat(300)],
    ['four lines', 'a\nb\nc\nd'],
    ['emoji with joiners', '👩‍👩‍👧'],
    ['leading and trailing tabs are trimmed', '\thi\t'],
  ])('accepts %s', (_name, text) => {
    expect(checkChatText(text).ok).toBe(true);
  });

  it('lists every reject reason', () => {
    expect(CHAT_REJECT_REASONS).toEqual([
      'NOT_A_MEMBER', 'EMPTY', 'TOO_LONG', 'CONTROL_CHARACTER', 'TOO_MANY_LINES',
      'TOO_FAST', 'RATE_LIMITED', 'ROOM_UNAVAILABLE', 'PERSISTENCE_FAILED',
    ]);
    expect(CHAT_LIMITS).toMatchObject({ maxCodePoints: 300, maxLines: 4, maxPerWindow: 5, windowMs: 10_000, minIntervalMs: 500, historySize: 200 });
  });
});

describe('chat frames', () => {
  it('ChatSend allows any text up to 4096 UTF-16 units; the room checks the rules', () => {
    expect(decodeClientFrame(enc({ t: 'ChatSend', clientMsgId: 'm', text: 'a\tb' })).ok).toBe(true);
    expect(decodeClientFrame(enc({ t: 'ChatSend', clientMsgId: 'm', text: 'x'.repeat(4096) })).ok).toBe(true);
  });

  it.each([
    ['text over 4096 units', { t: 'ChatSend', clientMsgId: 'm', text: 'x'.repeat(4097) }],
    ['missing text', { t: 'ChatSend', clientMsgId: 'm' }],
    ['text not a string', { t: 'ChatSend', clientMsgId: 'm', text: 1 }],
    ['empty clientMsgId', { t: 'ChatSend', clientMsgId: '', text: 'a' }],
    ['clientMsgId with NUL', { t: 'ChatSend', clientMsgId: 'a\u0000', text: 'a' }],
    ['clientMsgId too long', { t: 'ChatSend', clientMsgId: 'x'.repeat(129), text: 'a' }],
    ['an author field', { t: 'ChatSend', clientMsgId: 'm', text: 'a', authorId: 'p1' }],
  ])('client: %s is malformed', (_name, frame) => {
    expect(isMalformed(decodeClientFrame(enc(frame)))).toBe(true);
  });

  it.each([
    ['rejected ChatAck without reason', { t: 'ChatAck', clientMsgId: 'm', ok: false }],
    ['accepted ChatAck with reason', { t: 'ChatAck', clientMsgId: 'm', ok: true, reason: 'EMPTY' }],
    ['unknown reason', { t: 'ChatAck', clientMsgId: 'm', ok: false, reason: 'SPAM' }],
    ['ok not boolean', { t: 'ChatAck', clientMsgId: 'm', ok: 'yes' }],
    ['seq 0', { t: 'Chat', message: { seq: 0, authorId: 'p', text: 'a', at: 1 } }],
    ['fractional seq', { t: 'Chat', message: { seq: 1.5, authorId: 'p', text: 'a', at: 1 } }],
    ['empty text', { t: 'Chat', message: { seq: 1, authorId: 'p', text: '', at: 1 } }],
    ['negative at', { t: 'Chat', message: { seq: 1, authorId: 'p', text: 'a', at: -1 } }],
    ['author with NUL', { t: 'Chat', message: { seq: 1, authorId: 'p\u0000', text: 'a', at: 1 } }],
    ['extra message field', { t: 'Chat', message: { seq: 1, authorId: 'p', text: 'a', at: 1, x: 1 } }],
    ['welcome without history', (({ history: _h, ...rest }) => rest)(welcome)],
    ['history without chat', { ...welcome, history: { entries: [] } }],
    ['history with old flat events', { ...welcome, history: { events: [], chat: [] } }],
    ['history entry without at', { ...welcome, history: { entries: [{ revision: 1, events: [] }], chat: [] } }],
    ['history entry with revision 0', { ...welcome, history: { entries: [{ revision: 0, at: 1, events: [] }], chat: [] } }],
    ['history entry with a bad event', { ...welcome, history: { entries: [{ revision: 1, at: 1, events: [{ type: 'E' }] }], chat: [] } }],
    ['history entry with an extra field', { ...welcome, history: { entries: [{ revision: 1, at: 1, events: [], x: 1 }], chat: [] } }],
    ['history chat message without seq', { ...welcome, history: { entries: [], chat: [{ authorId: 'p', text: 'a', at: 1 }] } }],
  ])('server: %s is malformed', (_name, frame) => {
    expect(isMalformed(decodeServerFrame(enc(frame)))).toBe(true);
  });

  it('Welcome carries history entries with revision and time', () => {
    const decoded = decodeServerFrame(enc(welcome));
    expect(decoded).toEqual({ ok: true, frame: welcome });
  });

  it.each(CHAT_REJECT_REASONS.map((r) => [r]))('ChatAck reason %s decodes', (reason) => {
    expect(decodeServerFrame(enc({ t: 'ChatAck', clientMsgId: 'm', ok: false, reason })).ok).toBe(true);
  });
});
