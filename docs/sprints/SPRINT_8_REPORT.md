# Sprint 8 — Composed Verification Read

**Dates:** 2026-09-09 → 2026-09-09  ·  **Status:** Complete with carryover

## 1. Objective

Assemble everything the `/verification-result` page needs into the single public
read it was designed around: `GET /articles/{articleId}/verification` returns the
article, its current version and full published history, the current version's
evidence and reviewer notes, the publisher (with a **derived** credibility score
and transparency level), the anchor record, any redaction tombstone, a derived
6-value **TrustStatus**, and the list of facts that produced it. The frontend's
last two mock panels — TrustSummaryCard and PublisherCredibility — are wired to
it, and `VerificationResult.tsx` collapses from four piecemeal client calls to
one. Evidence, Review, and Dispute (Sprints 5–7) are the inputs; this sprint
composes them.

Four points were confirmed with the user before implementation: build this slice
(not account provisioning); the credibility formula (ratio-based, start 60, with
specific weights); the TrustStatus derivation and its precedence; and switching
`VerificationResult.tsx` to the single composed call. All four were built as
confirmed.

## 2. Changes from Previous Sprint

- **`VerificationResult.tsx` now makes one request.** The Sprint 3–6 wiring
  built it up call-by-call (`GET /articles/{id}`, `.../versions`,
  `.../versions/{id}/anchor`, `.../evidence`, `.../reviews`); those are all
  replaced by `GET /articles/{id}/verification`. The individual endpoints still
  exist and are still used by other screens (`ArticleEditHistory`,
  `MyArticlesTable`); only this page stopped calling them.
- **Four service mapper functions are now exported** (`toApiArticle`,
  `toApiVersion` from `articles.service`; `toApiEvidence` from
  `evidence.service`; `toApiReview` from `reviews.service`; `toApiDispute` from
  `disputes.service`). The verification service reuses them so the composed
  response can't drift from what the per-entity endpoints return. No behaviour
  of those services changed.
- **No migration, no contract amendment.** `verificationResultSchema`,
  `notFoundVerificationResultSchema`, `trustSummaryFactsSchema`, and the
  `GET /articles/{articleId}/verification` path have existed in
  `packages/shared` since Sprint 1 and fit unchanged. `openapi.json` and the
  generated client were regenerated in Sprint 1 and needed no change.
- **Carried over, still carried:** no "verify a version" transition (see §8 —
  this makes `authentic`/`updated` unreachable for API-created data today); no
  real chain `AnchorProvider`; no admin re-queue for `anchor_failed`; evidence
  hashes not anchored; no real `ObjectStore` / `SourceArchiver` /
  evidence-blob-read endpoint; evidence frontend write path unwired; no dispute
  frontend; `RegisterForm` unwired; no backend search; the redaction slice
  (content-blanking) unbuilt; the pre-existing millisecond-truncated cursor in
  `articles.repository.ts`.
- **Docker still unavailable** (eighth sprint). Verified via a scratch
  `embedded-postgres` instance outside the repo.

## 3. Key Enhancements

- `GET /articles/{articleId}/verification` (public) returns, for a registered
  article: `article`, `currentVersion`, `versionHistory` (newest first),
  `evidence` (current version), `reviews` (current version, retracted ones
  included and marked), `publisher` (with derived `credibilityScore` /
  `transparencyLevel`), `anchorRecord` (current version), `redaction` (or
  `null`), `trustStatus`, and `trustSummary` (`registryMember`, `versionMatch`,
  `publisherVerified`, `evidenceCount`, `openDisputeCount`).
- An unknown, archived, or draft-only article, or a non-UUID id, returns `404`
  with the special body `{ trustStatus: "notfound", queriedId? }` — never the
  generic error envelope. `queriedId` is present only when the path was a
  well-formed UUID.
- **TrustStatus** is derived, never stored, with the confirmed precedence
  `disputed > publisher_unverified > authentic_under_review > updated >
  authentic` (`notfound` handled by the route). An open dispute on the current
  version outranks everything; anchor state (pending / anchor_failed) is a
  separate track and is *not* an input.
- **Credibility** is computed at read time from the 3 confirmed factors as
  ratios over the publisher's published articles, so a large publisher isn't
  out-scored on volume:
  `score = clamp(0..100, round(60 + 40·verifiedRatio − 35·openDisputeRatio + 10·correctionRatio))`,
  `transparencyLevel = clamp(1..5, 1 + round(4·correctionRatio))`, and
  `score 0 / level 3` for a publisher with no published articles. The formula is
  published here and in `apps/api/src/services/trust.ts`.
- The frontend **TrustSummaryCard** shows the real status label, a
  status-specific explanation, and a "Why this result?" list built from the
  `trustSummary` facts; **PublisherCredibility** shows the real publisher name,
  verification badge, `credibilityScore`, a transparency word derived from
  `transparencyLevel`, and the publisher's categories. Both fall back to their
  mock when no `articleId` is in the URL.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/verification.route.ts` →
  `services/verification.service.ts` → `repositories/verification.repository.ts`,
  plus `services/trust.ts` — pure, I/O-free `deriveTrustStatus` and
  `computeCredibility`, unit-tested in isolation.
- **The verification service composes existing repositories** rather than
  re-querying: it calls `evidenceRepo.listEvidence`, `reviewsRepo.listReviews`,
  and `anchorRepo.findAnchorForVersion` (each with a high `LIMIT` for the
  version-scoped lists — counts are small at year-one volume) and the exported
  mappers, and adds a small `verification.repository` for what nothing else
  covers: the article lookup, the unpaginated published-version list, the
  publisher lookup, the redaction lookup, the open-dispute count for one
  version, and the publisher-wide credibility aggregate.
- **Hot-path shape:** one route, one service call. The six sub-reads run under a
  single `Promise.all`. The credibility aggregate is 3 batch queries (articles →
  their non-draft versions → which current versions have an open dispute via a
  `NOT EXISTS (terminal event)` subquery), never N+1.
- **No new dependency**, no new package edge, no new background process, no
  schema change.

## 5. Database Changes

**None.** `migrations/` is unchanged. The endpoint reads `articles`,
`article_versions`, `publishers`, `evidence`, `reviews` (+ `reviewers`,
`accounts`), `anchor_records` (+ `anchor_batches`), `disputes`,
`dispute_events`, and `redactions` — all Sprint 1 tables. No column, index, or
constraint was added or changed. The cached `publishers.credibility_score` /
`publishers.transparency_level` columns and the `credibility_score_history`
table are **not written** by this slice — the score is computed live and those
remain for a future publisher-dashboard slice.

## 6. New Components

**Endpoint** (of the 33 in `openapi.json`, 21 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /articles/{articleId}/verification | public | The composed verification read: article + current version + history + evidence + reviews + publisher (derived credibility) + anchor + redaction + derived TrustStatus + trustSummary facts. 404 `{ trustStatus: "notfound", queriedId? }` for unknown / archived / draft-only / non-UUID. |

Layering: `routes/verification.route.ts` → `services/verification.service.ts`
(+ `services/trust.ts`) → `repositories/verification.repository.ts` and the
evidence / reviews / anchor repositories → Postgres.

**`apps/api` new modules:** `repositories/verification.repository.ts`
(`findArticle`, `findPublisher`, `listPublishedVersions`,
`findRedactionForVersion`, `countOpenDisputesForVersion`,
`findVersionIdsWithOpenDispute`, `creditAggregate`),
`services/verification.service.ts` (`getVerification`), `services/trust.ts`
(`deriveTrustStatus`, `computeCredibility`), `routes/verification.route.ts`.

**Exports added** to existing services: `toApiArticle`, `toApiVersion`,
`toApiEvidence`, `toApiReview`, `toApiDispute`.

**Frontend** wired to real data, no structural change: `VerificationResult.tsx`
(one composed call), `TrustSummaryCard.tsx` and `PublisherCredibility.tsx`
(each takes an optional prop, null → mock).

## 7. Sprint Test Results

**Totals: 150 tests, 150 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 110 — up from
87 by 12 trust unit tests and 11 verification integration tests). No test was
weakened to pass.

**`apps/api` — `test/trust.unit.test.ts`: 12/12** (pure, no DB):
- `deriveTrustStatus`: each of the five reachable postures, plus that `disputed`
  outranks every other input and `publisher_unverified` outranks review/version
  state.
- `computeCredibility`: empty publisher → `{ 0, 3 }`; all-verified/never-disputed
  → 100 / level 1; an open dispute pulls the score down by the expected amount
  (91 for 1-of-4); transparent corrections lift the score and the level (100 /
  level 5 for all-corrected); the floor of 25 when everything is disputed and
  nothing verified; and score/level always land in range for a mixed publisher.

**`apps/api` — `test/verification.integration.test.ts`: 11/11** (real Postgres,
`--no-file-parallelism`):
- **404** — unknown UUID → `{ trustStatus: "notfound", queriedId }`; non-UUID id
  → `{ trustStatus: "notfound" }` with no `queriedId`; an archived article; an
  article whose only version is a draft.
- **authentic_under_review** — a just-submitted v1.0 on a verified publisher:
  asserts `trustStatus`, `currentVersion.id`, `versionHistory` length 1,
  `anchorRecord.status: "pending"`, `redaction: null`, every `trustSummary`
  fact, and that `publisher.credibilityScore` / `transparencyLevel` are present
  and in range.
- **publisher_unverified** — an article published while its publisher was
  verified, then the publisher's verification dropped.
- **authentic** — a verified v1.0 with no dispute (version inserted directly —
  see below).
- **updated** — a verified article with a v2.0 (`versionHistory` length 2,
  `currentVersion.versionLabel === "v2.0"`).
- **disputed ⇄ authentic** — filing an open dispute flips `trustStatus` to
  `disputed` and `openDisputeCount` to 1; withdrawing it returns both.
- **evidence + reviews** — a draft with an attached file, submitted, then
  reviewed: the response's `evidence` and `reviews` arrays and
  `trustSummary.evidenceCount` reflect it.
- **credibility** — an isolated verified publisher with one clean and one
  disputed article: `credibilityScore` is `round(60 − 35·0.5) = 43`.

**Invariant coverage (build prompt):**
- *Credibility is derived, never written; the computation is published* —
  `computeCredibility` in `trust.ts` runs on already-loaded record data; no
  endpoint or column is written; the cached `publishers.credibility_score` is
  ignored by this endpoint. The unit tests pin the exact formula.
- *SourceIt does not adjudicate truth* — `trustStatus` is a projection over
  registry / version / publisher-verification / dispute facts; `trustSummary`
  returns exactly those facts; there is no `isTrue` and no status the platform
  sets to mean a claim is false.
- *Reads are public and unauthenticated* — the route has no `preHandler`.
- *The verification page must never be slow or down* — one endpoint, one
  `Promise.all`, a 3-query batch-loaded credibility aggregate.

**Test-only bypass, disclosed:** the `authentic` and `updated` integration tests
insert `article_versions` rows with `reviewStatus: 'verified'` directly, because
**no code path moves a version from `pending_review` to `verified`** (see §8) and
the append-only trigger blocks `UPDATE` on a non-draft row. The inserts also add
matching `anchor_records`. This is setup for a state the system will reach once
version verification exists; the derivation logic itself is fully exercised.

**Existing suites, unchanged and still green:** `articles` 18/18, `evidence`
13/13, `reviews` 18/18, `disputes` 31/31, `anchor` 4/4, `me` 3/3;
`@sourceit/worker` 7/7; `@sourceit/anchoring` 33/33.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across all four packages. No `any`,
no `@ts-expect-error`, no skipped tests. **`apps/web`:** `vite build` succeeds
(2204 modules, unchanged count).

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2.

## 8. Outcome

**Done and verified against a real Postgres:** `GET /articles/{id}/verification`
end to end — the composed payload, the special-shaped 404, the derived
6-value TrustStatus with its confirmed precedence, and the published
ratio-based credibility formula computed at read time. `VerificationResult.tsx`
is one request; TrustSummaryCard and PublisherCredibility show real data. 150/150
tests green.

**Not done, deliberately or blocked:**
- **`authentic` and `updated` are unreachable for data created through the
  API.** A version is `pending_review` from submission onward, and nothing moves
  it to `verified`: there is no reviewer/admin "verify this version" endpoint,
  and the append-only trigger forbids `UPDATE` on a non-draft row. So a real
  published article currently resolves to `authentic_under_review` (or
  `disputed` / `publisher_unverified`). The derivation and the frontend handle
  all six values; `authentic`/`updated` light up once version verification is
  built (it belongs with the reviewer-approval flow). **This is the single most
  important limitation of this slice.**
- **`redaction` is always `null` in practice.** No redaction rows exist and
  there is no redaction endpoint; content-blanking for a redacted version is
  the unbuilt redaction slice. The field is wired and will populate when that
  lands.
- **`registryMember` and `versionMatch` are `true` on every 200.** A served
  published version *is* the registered record, so both facts hold whenever the
  endpoint returns 200 — matching the frontend's always-ticked checklist. They
  become discriminating only if a future change can serve a version that is
  registered-but-not-matching.
- **The cached `publishers.credibility_score` column and
  `credibility_score_history` are not written.** The score is live-computed
  here; persisting it and the sparkline history is a publisher-dashboard slice
  concern.
- **`PublisherCredibility.tsx`'s "Correction History" box** shows real
  derivation copy for a loaded publisher but keeps its mock counts
  ("12 articles published…") for the no-`articleId` fallback — the composed
  response doesn't carry those aggregate counts (they live on
  `publisherAnalyticsSchema`, a different endpoint).

**Known debt incurred:**
- Version-scoped `evidence` / `reviews` are fetched with `LIMIT 1000`. Fine at
  year-one volume; a genuinely huge set would silently truncate in this
  response. Repay with a dedicated count-and-cap or pagination if it ever
  matters.
- Five service mappers are now exported purely for reuse by the verification
  service. Low cost; they are still the single source of each entity's wire
  shape.
- Same pre-existing item as Sprints 5–7: `articles.repository.ts` cursor
  pagination keys on a millisecond-truncated `created_at` ISO string.

**Blocked on:** nothing.

**Next sprint should do first:** the **reviewer / admin decision endpoints** —
`PATCH`-equivalent "verify this version" for a reviewer or admin, plus the
publisher-verification and reviewer-approval decision endpoints the Sprint 1
schema and the `admin` role were built for. This makes `authentic` / `updated`
reachable, lights up the two admin queues, and is the natural companion to the
Review slice. Alternatively, account provisioning (`POST /publishers`,
`POST /reviewers/apply`) so `RegisterForm` works, or the redaction slice. Either
way: push to GitHub and confirm CI actually goes green — it still never has.
