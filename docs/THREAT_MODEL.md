# SourceIt — Threat pass

Phase 5 (Sprint 15). For each endpoint group: what the most motivated hostile
user tries, and what stops them. The system's job is an **append-only,
chain-anchored audit trail** — the highest-value attacks are the ones that would
let history be rewritten, a dispute be buried, or "verified" mean less than it
says.

## Cross-cutting controls

- **Auth**: a Clerk-issued JWT as `Authorization: Bearer`, verified with
  `@clerk/backend`'s `verifyToken`. The trusted identity is the token's `sub`
  (the Clerk user id); `fullName` / `email` in request bodies are profile
  mirrors and never authenticate. `requireActor` additionally requires a local
  `accounts` row (401 otherwise); `requireAuth` (registration only) accepts a
  valid session without one.
- **Authorization**: one `can(actor, action, resource)` function. Every mutating
  handler calls it; no authorization lives in a route conditional or a `WHERE`
  clause. Negative tests exist per endpoint (wrong user → 403/404).
- **Append-only at the database**: `reject_update_delete()` /
  `reject_non_draft_update_delete()` triggers on `article_versions` (non-draft),
  `evidence`, `reviews`, `review_retractions`, `disputes`, `dispute_events`,
  `version_verifications`, `redactions`. A compromised *application* cannot
  `UPDATE`/`DELETE` these rows — the database refuses.
- **Timestamps** are server-assigned; any client-supplied timestamp on a write
  is ignored.
- **Rate limiting**: per-IP, tighter on mutating methods; health checks exempt.
- **Error envelope**: unexpected 5xx return an opaque `INTERNAL_ERROR` with no
  internals; the real error is logged server-side with a fingerprint.
- **Validation**: Zod at every trust boundary (body, params, query, env).
- **Reads are public and unauthenticated by design** — verification, version
  history, evidence, disputes, publisher records. Rate limiting, not auth,
  protects them.

## Article & version writes — `POST /articles`, `POST`/`PATCH`/`DELETE
/articles/{id}/versions`, `POST /articles/{id}/archive`

| Attack | Stop |
|---|---|
| Publish under another publisher's name | `article:createDraft` / `article:submit` require a `publisher_members` row for `publisherId`; `publisherId` is explicit in the body, not inferred, and checked. |
| Rewrite a published version's content ("stealth edit") | The append-only trigger rejects any `UPDATE` on a non-draft `article_versions` row. Corrections are new versions, hash-chained to the previous (`previousHash`). |
| Backdate a publication | `publishedAt` is `new Date()` server-side at submit; the request cannot set it. |
| Submit as an unverified publisher to gain a "verified" look | `article:submit` also checks `publishers.verificationStatus === 'verified'`; an unverified publisher's article resolves to `publisher_unverified` in `GET /articles/{id}/verification` regardless. |
| Hard-delete an inconvenient published version | `DELETE` only succeeds while `review_status = 'draft'` (enforced in the service *and* the trigger). |
| Break the hash chain by tampering with `contentHash` | The chain is verifiable offline against the anchored Merkle root; a mismatch fails verification. Postgres is a cache, not the root of trust. |

## Reviewer actions — `POST /versions/{id}/reviews`, `/retract`, `POST
/versions/{id}/verify`, disputes

| Attack | Stop |
|---|---|
| A publisher reviews / verifies / disputes its own article to inflate credibility | Structural COI: `review:create` / `dispute:file` / `version:verify` deny any actor who is a `publisher_members` row for that publisher. Enforced, not disclosed — the denial names the rule, never the caller's affiliation. |
| A non-reviewer posts reviews | The gate requires an `approved` `reviewers` row; `pending` / `rejected` / absent → 403. |
| Edit or silently delete a review after the fact | `reviews` is append-only (trigger). Retraction is a new `review_retractions` row; the original text stays visible, marked retracted. |
| Retract someone else's review | `review:retract` is author-only (`reviewerAccountId === actor.accountId`). |
| Flip a version to `verified` without a reviewer | `verified` is not a stored column the API writes — it is derived from a `version_verifications` row, which only the gated endpoint can create, once per version (`UNIQUE` → 409). |
| Verify a version, then dispute it, to keep a "verified + disputed" contradiction | Allowed and harmless: `disputed` outranks `verified` in the TrustStatus precedence, so the reader sees `disputed`. |

## Disputes — `POST /versions/{id}/disputes`, `/respond`, `/resolve`

| Attack | Stop |
|---|---|
| Publisher deletes / hides / downranks a dispute against it | Impossible: `disputes` + `dispute_events` are append-only; both reads are public and unauthenticated; the publisher's only write is an appended `publisher_responded` event (`dispute:respond` = membership). `/resolve` and `/withdraw` deny publisher members. |
| Publisher marks its own dispute "resolved" | `dispute:resolve` = the filer or a `role === 'admin'` account, never the publisher. `dispute:withdraw` = the filer alone (not even an admin). |
| Publisher "responds" with a correction pointing at an unrelated or draft version | `correctionVersionId` is validated to be a *published* version of the *disputed article* (400 otherwise). |
| Reopen a terminally-closed dispute | After `withdrawn` / `resolved_*`, `/respond` and `/resolve` return 409. |
| Flood an article with disputes | Rate limiting on the write; each dispute is still individually attributed to an approved reviewer. |

## Admin queues — `GET`/`POST /publishers/{id}/verification`,
`/reviewers/{id}/decision`

| Attack | Stop |
|---|---|
| A non-admin approves itself as a verified publisher / approved reviewer | All four gated by `{ type: 'admin' }` (`actor.role === 'admin'`); 403 otherwise. `role` is set from the `accounts` row by `requireActor`, not from the request. |
| Escalate to `admin` via registration | `POST /readers` / `/publishers` / `/reviewers/apply` force `role` from *which endpoint was called*; `ensureAccount` is first-writer-wins and never sets `admin`. An `admin` row is created only out-of-band. |
| Replay an old decision to revert a state | Decisions record `verified_by` / `approved_by` + timestamp; they are permissive on current state by design (re-verify / revoke), and `404` an unknown id. "Rejected is terminal" binds the applicant, not the admin. |

## Redaction — `POST /versions/{id}/redaction`

| Attack | Stop |
|---|---|
| A publisher redacts a dispute or a bad review away | `{ type: 'admin' }` only. And redaction blanks *version content* at the read layer — it does not touch evidence, reviews, disputes, or the anchor. |
| Un-redact to restore takedown'd content | No un-redact endpoint; the tombstone is append-only (`UNIQUE` article_version_id → 409 on a repeat). |
| Use redaction to erase the fact that something existed | The tombstone remains fully public: position, category, hash, timestamp. Only `headline`/`summary`/`content`/`authorName`/`tags`/`sourceLinks` go null. |
| Leak the legal reason (a sealed docket, a claimant's identity) | `reason` is stored but returned by **no** endpoint. |
| Tamper with the `article_versions` row a redaction "hides" | The row is never modified — suppression is entirely in the read mapper. The original bytes stay for anyone verifying the anchored hash. |

## Reader features — `POST /readers`, `/saved-articles`, `/publisher-follows`

| Attack | Stop |
|---|---|
| Read another reader's saved list / follows | Every list is scoped to `actor.accountId` at the repository layer; there is no `readerId` path parameter. |
| Delete another reader's bookmark / follow | `DELETE` checks the row's `account_id === actor.accountId` → 403 for anyone else, 404 for an unknown id. |
| Register with an email that belongs to someone else | `ensureAccount` keys on the verified `clerkUserId`; an email already on a *different* `clerkUserId` → 409. |
| Enumerate articles via `POST /saved-articles` error codes | A non-existent, archived, or draft-only article all return the same `404 "No such article"` — no distinction leaked. |

## Publisher dashboard — `GET /publishers/{id}` and `/{id}/*`

| Attack | Stop |
|---|---|
| Set or inflate a credibility score | No endpoint or column writes it — it is computed at read time from the record. `credibility_score_history` is an append-only log of recomputes, keyed by the same derivation; the cached column is never written. |
| Forge activity-feed events | `activity_events` rows are written only by the service hooks after a real, authorized mutation; the feed is read-only and there is no write endpoint. |
| Scrape a competitor's analytics / activity at volume | `requireActor` (any signed-in account) + rate limiting. These expose only aggregate counts and event titles, no PII; the underlying reviews/disputes were already public. |
| Page-cursor tampering on `/reviews` | The cursor is `<createdAt>~<kind>~<id>`; a malformed cursor decodes to `null` and the endpoint returns the first page. A crafted cursor can only skip the caller's own view forward — it cannot reveal hidden rows (there are none). |

## Evidence — `POST /versions/{id}/evidence`, `GET .../evidence/{id}/file`

| Attack | Stop |
|---|---|
| Attach evidence to a version that is not yours | `evidence:attach` = membership of the owning publisher. |
| Swap evidence after a version is submitted | Evidence attaches only while the version is a `draft`; once it leaves draft the set is frozen (409) and `evidence` rows are append-only. |
| Oversized upload to exhaust memory / disk | `@fastify/multipart` `fileSize: 25 MB`, `files: 1`, `fields: 16`; an over-limit stream is rejected `413 PAYLOAD_TOO_LARGE`. |
| `tag=source` pointing at an internal URL (SSRF) | **Closed** (Sprint 18) — `createGuardedSourceArchiver` (`apps/api/src/storage/sourceArchiver.ts`) resolves the hostname via DNS and rejects the request if any resolved address (or a redirect target's) falls in a private / loopback / link-local / CGNAT / multicast range, including the 169.254.169.254 cloud metadata address and an IPv4-mapped-IPv6 literal. The actual socket connects to the pre-resolved, already-validated address (a custom `lookup`), closing the DNS-rebinding TOCTOU gap between check and connect. Only `http:`/`https:` schemes are allowed; redirects are followed manually (max 5 hops), re-validating every hop the same way as the first; the response body is capped at 25 MB and each hop times out at 15s. |
| Enumerate evidence ids to find files that aren't attached to a version they belong to | `GET .../evidence/{evidenceId}/file` checks `evidence.article_version_id === versionId` — an id that exists but belongs elsewhere 404s, same as an unknown id. |
| Read a file whose version is still a private draft | The file endpoint 404s while the owning version is a draft, same as the listing. |
| A leaked "View File" link keeps working forever | The presigned URL expires (`OBJECT_STORE_SIGNED_URL_TTL_SECONDS`, default 15 min); the bucket itself is private, so there is no stable public URL to leak in the first place — only a fresh, short-lived one per click. |

## Known residual risk

- **The chain signer is a raw env key** — fine for testnet / a small mainnet
  float; a KMS-backed signer or gas relayer removes the key from the worker env
  entirely (documented in the runbook, the `ChainOps` seam is the swap point).
  The Merkle spec and proof format are frozen and third-party-verifiable
  regardless of signer.
- **The chain provider's live path is unverified here** — no deployed contract,
  no funded testnet key in this environment. Unit-tested against a
  contract-faithful model; run the live test once deployed.
- **Object storage credentials are a static access key in `api`'s env** — scope
  it to the one bucket, `GetObject`/`PutObject`/`HeadObject` only. A future
  hardening pass could move to short-lived STS credentials.
- **`clerk_org_id` is a placeholder** — publisher org membership is our
  `publisher_members` table, not Clerk-synced. A Clerk-org takeover is not a
  vector because we do not trust Clerk orgs for anything yet.
- **Rate limiting is per-instance** — N instances → N× the limit. Redis store
  swap documented in the runbook.
- **`Actor.role` is a bare string** compared `=== "admin"` — fine today; tighten
  to the enum if `role` gains more comparisons.
- **The SSRF guard blocks by IP range, not by hostname allow-list** — any
  public host is reachable (by design, since a "source" can be any public
  article URL), and it does not restrict destination ports. A public host
  that itself proxies to an internal service is outside this guard's reach;
  standard for this class of defense and not treated as a gap here.
