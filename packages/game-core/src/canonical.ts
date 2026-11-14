/**
 * Plain-data checks and a canonical JSON encoding used for command
 * fingerprints and replay comparison. Object keys are sorted recursively, so
 * key insertion order never affects the output.
 */

function isPlainObject(v: object): boolean {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * True for JSON-compatible data: null, booleans, finite numbers, strings,
 * dense arrays and plain objects of those, without cycles.
 */
export function isPlainData(value: unknown): boolean {
  const ancestors = new Set<object>();

  const walk = (v: unknown): boolean => {
    if (v === null) return true;
    switch (typeof v) {
      case 'boolean':
      case 'string':
        return true;
      case 'number':
        return Number.isFinite(v);
      case 'object': {
        if (ancestors.has(v)) return false;
        ancestors.add(v);
        let okAll: boolean;
        if (Array.isArray(v)) {
          okAll = true;
          for (let i = 0; i < v.length; i++) {
            if (!(i in v) || !walk(v[i])) {
              okAll = false;
              break;
            }
          }
        } else if (isPlainObject(v)) {
          okAll = Object.getOwnPropertySymbols(v).length === 0 && Object.values(v).every(walk);
        } else {
          okAll = false;
        }
        ancestors.delete(v);
        return okAll;
      }
      default:
        return false; // undefined, function, symbol, bigint
    }
  };

  return walk(value);
}

/** Canonical JSON with recursively sorted keys. Input must satisfy isPlainData. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}
