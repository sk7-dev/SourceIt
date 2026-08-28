// Deterministic JSON serialization: object keys sorted alphabetically at
// every level (recursively), arrays preserve their given order, no
// insignificant whitespace. Two structurally-equal values always produce the
// identical string, regardless of the key order used to construct them in
// memory — this is what makes the resulting hash a property of the *content*,
// not of how some particular caller happened to build the object.
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(",")}}`;
}
