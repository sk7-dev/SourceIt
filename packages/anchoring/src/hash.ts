import { canonicalStringify } from "./canonicalize";

// FROZEN SPEC — build prompt Section 3: "Hashing: SHA-256 over a canonical
// serialization you define and freeze in Phase 1. Write the canonicalization
// spec before the code." (Written in Sprint 3, when the first real content
// hash was needed — see docs/PROJECT_STATE.md Known debt for why this slipped
// a phase.) Changing this object's field list, or the canonicalization
// algorithm in canonicalize.ts, changes every previously-computed hash and
// must never happen after this ships — it is a new version of the spec, not a
// bugfix, and needs its own migration story for anything hashed under the old
// one.
//
// Exactly the fields that define what was published: everything an author can
// edit for a version. Excludes identity/bookkeeping (id, articleId, version
// numbers, previousHash, timestamps) — those describe the version's place in
// the chain, not its content, and are covered by the chain (previousHash)
// instead.
export interface VersionContent {
  headline: string;
  summary: string;
  content: string;
  authorName: string;
  tags: string[];
  sourceLinks: string[];
  changeType: string;
  changeSummary: string | null;
}

// A skeptical third party must be able to recompute this offline, given only
// the published content and this spec (build prompt, "The verification
// property") — Web Crypto (`crypto.subtle`) rather than Node's `node:crypto`,
// so the exact same code runs unmodified in a browser or any other JS runtime
// a verifier might use, not just this server.
export async function hashVersionContent(content: VersionContent): Promise<string> {
  const canonical = canonicalStringify(content);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
