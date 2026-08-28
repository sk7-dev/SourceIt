# SourceIt — Content Hash Canonicalization Spec

**Frozen 2026-08-26 (Sprint 3).** Implemented in `packages/anchoring`. A skeptical
third party must be able to recompute an article version's hash offline, given only
the published content and this document (build prompt, "The verification
property") — so this spec, once published, does not change. A change to either the
field list or the algorithm below is a new version of the spec, not a bugfix, and
requires its own migration story for anything already hashed under the old one.

## What gets hashed

Exactly the fields of an `ArticleVersion` an author can edit — the content, not the
bookkeeping. See `packages/anchoring/src/hash.ts`'s `VersionContent` type:

```
headline: string
summary: string
content: string
authorName: string
tags: string[]
sourceLinks: string[]
changeType: string
changeSummary: string | null
```

Excluded: `id`, `articleId`, `versionMajor`/`versionMinor`, `previousHash`,
`createdAt`/`publishedAt`. These describe the version's position in the chain, not
what was published — the chain link itself is `previousHash`, not re-hashed content.

## Algorithm

1. **Canonicalize** (`packages/anchoring/src/canonicalize.ts`): serialize the object
   to JSON with object keys sorted alphabetically at every nesting level, arrays left
   in their given order (array order is content, not incidental), and no
   insignificant whitespace. This makes the output independent of how a particular
   caller happened to construct the object in memory.
2. **Hash**: SHA-256 (`crypto.subtle.digest`, the Web Crypto standard — chosen over
   `node:crypto` specifically so the identical code runs unmodified in a browser,
   not just this server) over the UTF-8 bytes of the canonical string. Hex-encoded,
   lowercase, 64 characters.

## Worked example

```
Input:  { headline: "H", summary: "S", content: "C", authorName: "A",
          tags: ["x"], sourceLinks: [], changeType: "original_published",
          changeSummary: null }

Canonical string:
{"authorName":"A","changeSummary":null,"changeType":"original_published",
 "content":"C","headline":"H","sourceLinks":[],"summary":"S","tags":["x"]}

SHA-256 of that UTF-8 string → the version's contentHash.
```

## Tested properties

`packages/anchoring/test/hash.test.ts` proves: the hash is independent of field
insertion order; changing any single field changes the hash; array order matters
(`["a","b"]` hashes differently than `["b","a"]`); the same input always produces
the same hash.
