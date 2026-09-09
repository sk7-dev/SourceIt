// Fetches and snapshots an external source URL at the moment evidence is
// attached, so verification of a version does not silently degrade when a
// third-party link later rots (docs/PROJECT_STATE.md decision 2026-08-26,
// resolving OPEN_QUESTIONS.md #7). Abstracted behind an interface: a real
// implementation does a guarded server-side fetch (SSRF allow/deny-listing,
// redirect and body-size caps, timeouts) and belongs with the Phase 5 threat
// pass — this sprint ships only the deterministic fake, matching how the
// Anchoring slice shipped only createFakeAnchorProvider.
export interface ArchivedSource {
  bytes: Uint8Array;
  contentType: string;
}

export interface SourceArchiver {
  archive(url: string): Promise<ArchivedSource>;
}

// Deterministic: the same URL always snapshots to the same bytes, so a test
// (or a caller) can predict the resulting content hash without a network.
export function createFakeSourceArchiver(): SourceArchiver {
  return {
    async archive(url) {
      const bytes = new TextEncoder().encode(`archived-snapshot:${url}`);
      return { bytes, contentType: "application/octet-stream" };
    },
  };
}
