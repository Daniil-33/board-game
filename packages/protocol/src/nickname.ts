import { FormatRegistry } from '@sinclair/typebox';

export const NICKNAME_MIN_CODE_POINTS = 1;
export const NICKNAME_MAX_CODE_POINTS = 24;

// Control, format, surrogate, private-use, unassigned, line and paragraph
// separators. ZWNJ (U+200C) and ZWJ (U+200D) are format characters but are
// allowed: emoji sequences and scripts such as Persian need them.
const NON_PRINTABLE = /(?![\u200C\u200D])[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;

/**
 * Technical nickname rule: equal to its own trim, 1-24 Unicode code points,
 * printable code points only (ZWNJ and ZWJ allowed). No product rules.
 */
export function isValidNickname(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  // Cheap upper bound before splitting: each code point is at most 2 UTF-16 units.
  if (value.length > NICKNAME_MAX_CODE_POINTS * 2) return false;
  const codePoints = [...value].length;
  if (codePoints < NICKNAME_MIN_CODE_POINTS || codePoints > NICKNAME_MAX_CODE_POINTS) return false;
  return !NON_PRINTABLE.test(value);
}

/** Trims `value` and returns it when it is a valid nickname, otherwise `null`. */
export function normalizeNickname(value: string): string | null {
  const trimmed = value.trim();
  return isValidNickname(trimmed) ? trimmed : null;
}

/**
 * JSON Schema `format` used by nickname schemas. TypeBox's registry is filled
 * by this module; the server adds the same validator to Ajv
 * (`ajv.addFormat(NICKNAME_FORMAT.name, NICKNAME_FORMAT.validate)`), so both
 * sides apply one rule and agree on astral characters.
 */
export const NICKNAME_FORMAT = {
  name: 'game-nickname',
  validate: (value: string): boolean => isValidNickname(value),
} as const;

FormatRegistry.Set(NICKNAME_FORMAT.name, NICKNAME_FORMAT.validate);
