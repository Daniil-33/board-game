import type { TSchema } from '@sinclair/typebox';
import { TypeCompiler, type TypeCheck } from '@sinclair/typebox/compiler';
import { MAX_FRAME_LENGTH } from './common.js';
import {
  AckFrameSchema,
  CommandFrameSchema,
  ErrorFrameSchema,
  HelloFrameSchema,
  UpdateFrameSchema,
  WelcomeFrameSchema,
  type ClientFrame,
  type ServerFrame,
} from './frames.js';

export interface MalformedFrameError {
  readonly code: 'MALFORMED_FRAME';
  readonly message: string;
}

export type DecodeResult<F> =
  | { readonly ok: true; readonly frame: F }
  | { readonly ok: false; readonly error: MalformedFrameError };

type Checkers = ReadonlyMap<string, TypeCheck<TSchema>>;

const compile = (entries: [string, TSchema][]): Checkers =>
  new Map(entries.map(([tag, schema]) => [tag, TypeCompiler.Compile(schema)]));

const CLIENT_CHECKERS = compile([
  ['Hello', HelloFrameSchema],
  ['Command', CommandFrameSchema],
]);

const SERVER_CHECKERS = compile([
  ['Welcome', WelcomeFrameSchema],
  ['Ack', AckFrameSchema],
  ['Update', UpdateFrameSchema],
  ['Error', ErrorFrameSchema],
]);

const malformed = (message: string): { ok: false; error: MalformedFrameError } => ({
  ok: false,
  error: { code: 'MALFORMED_FRAME', message },
});

function decode<F>(raw: unknown, checkers: Checkers): DecodeResult<F> {
  try {
    if (typeof raw !== 'string') return malformed('frame is not text');
    if (raw.length > MAX_FRAME_LENGTH) return malformed(`frame exceeds ${MAX_FRAME_LENGTH} characters`);

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return malformed('frame is not valid JSON');
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return malformed('frame is not a JSON object');
    }
    const tag = Object.hasOwn(value, 't') ? (value as { t: unknown }).t : undefined;
    const checker = typeof tag === 'string' ? checkers.get(tag) : undefined;
    if (checker === undefined) return malformed('unknown or missing frame tag "t"');

    if (checker.Check(value)) return { ok: true, frame: value as F };
    const first = checker.Errors(value).First();
    return malformed(first ? `${first.path || '/'}: ${first.message}` : 'frame does not match schema');
  } catch {
    // Defensive: nothing above is expected to throw, but hostile input must never escape.
    return malformed('frame could not be decoded');
  }
}

/** Decodes untrusted text received by the server. Never throws. */
export function decodeClientFrame(raw: unknown): DecodeResult<ClientFrame> {
  return decode<ClientFrame>(raw, CLIENT_CHECKERS);
}

/** Decodes untrusted text received by the client. Never throws. */
export function decodeServerFrame(raw: unknown): DecodeResult<ServerFrame> {
  return decode<ServerFrame>(raw, SERVER_CHECKERS);
}
