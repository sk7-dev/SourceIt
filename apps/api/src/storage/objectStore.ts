// Content-addressed blob storage for evidence files — build prompt "Third-party
// systems in scope": "Object storage for evidence files, content-addressed by
// hash." Abstracted behind an interface so the real backend (S3 / R2 / a
// volume) is a later, swappable concern; this sprint ships only the in-memory
// implementation, the same call the Anchoring slice made with AnchorProvider
// (docs/PROJECT_STATE.md decision 2026-09-08). A real store plugs in here with
// no service or route change.
export interface ObjectStore {
  // Idempotent on `key`: the key is the content hash, so re-`put`ting the same
  // bytes under the same key is a no-op and never an error.
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}

export function createInMemoryObjectStore(): ObjectStore {
  const blobs = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    async put(key, bytes, contentType) {
      if (!blobs.has(key)) blobs.set(key, { bytes, contentType });
    },
    async get(key) {
      return blobs.get(key) ?? null;
    },
  };
}
