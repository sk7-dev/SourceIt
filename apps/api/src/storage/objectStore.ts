// Content-addressed blob storage for evidence files — build prompt "Third-party
// systems in scope": "Object storage for evidence files, content-addressed by
// hash." Abstracted behind an interface so the real backend (S3 / R2 / a
// volume) is a swappable concern, the same call the Anchoring slice made with
// AnchorProvider (docs/PROJECT_STATE.md decision 2026-08-26). A real store
// plugs in here with no service or route change; see storage/s3ObjectStore.ts.
export interface ObjectStore {
  // Idempotent on `key`: the key is the content hash, so re-`put`ting the same
  // bytes under the same key is a no-op and never an error.
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  // A short-lived URL a browser can be redirected to for a direct download —
  // the "View File" affordance (Sprint 17). The bucket is private; every call
  // mints a fresh link.
  getSignedUrl(key: string): Promise<string>;
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
    // Not a real URL — there is nothing to redirect a browser to without a real
    // backend. Distinct and greppable, so a misconfigured local/dev
    // environment fails obviously rather than looking like a working link.
    async getSignedUrl(key) {
      return `memory://unconfigured-object-store/${key}`;
    },
  };
}
