/** Validate plain configuration shapes and catch misspelled options. */
export function record(
  value: unknown,
  names: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const name of Object.keys(value)) {
    if (!names.has(name)) throw new TypeError(`Unknown ${label} option: ${name}`);
  }
  return value as Record<string, unknown>;
}

export function iterable(value: unknown, label: string): Iterable<unknown> {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof (value as Iterable<unknown>)[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError(`${label} must be an iterable`);
  }
  return value as Iterable<unknown>;
}

export function snapshot(
  value: unknown,
  normalize: (input: unknown) => string | null,
  label: string,
): ReadonlySet<string> {
  const result = new Set<string>();
  if (value === undefined) return result;
  for (const entry of iterable(value, label)) {
    const normalized = normalize(entry);
    if (normalized === null) throw new TypeError(`${label} contains an invalid entry`);
    result.add(normalized);
  }
  return result;
}
