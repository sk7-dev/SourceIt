# Sprint 6 — Review Slice

**Dates:** 2026-09-09 → 2026-09-09  ·  **Status:** Complete with carryover

## 1. Objective

Make reviewer annotations real: an approved reviewer with no structural
affiliation to a publisher can attach a `confirmation` / `clarification` /
`correction_note` to one of its published versions, anyone can read a version's
reviewer notes, and a reviewer can retract their own review without the original
text ever being altered or hidden. This is the second of the three inputs
`GET /articles/{id}/verification` needs (Evidence shipped in Sprint 5, Dispute is
next), and it lets the verification page's Reviewer Notes panel show real data.
The slice follows the Phase 3 template: create + list + retract, authorization
with negative tests (including the structural conflict-of-interest block),
integration tests for every failure mode, the frontend read path wired and its
mock removed from the code path. There is no update/delete endpoint — reviews
and their retractions are append-only by a build-prompt invariant and database
triggers.

The objective was met. Nothing in it was blocked. Two scoping points were
confirmed with the user before implementation (build the Review slice rather
than account provisioning; wire only the read path, not a reviewer-submission
UI). Both were built as confirmed.

## 2. Changes from Previous Sprint

- **`createAuthorization` now takes a second argument, `reviewersRepo`.** The
  `review:create` decision needs the reviewer's approval status, and the
  cross-cutting standard puts every authorization decision inside the single
  `can` function, not the service. The three existing routes that build an
  authorizer (`articles`, `publisherArticles`, `evidence`) each gained a
  one-line `createReviewersRepository(app.db)` argument; nothing else about
  their behaviour changed.
- **`GET` / `POST /versions/{versionId}/reviews` gained a `404` response and
  `POST /reviews/{reviewId}/retract` gained `404` and `409`** in the contract —
  the Sprint 1 paths omitted them. This is an additive OpenAPI amendment (no
  request or response *body* shape changed, unlike Sprint 5's multipart
  switch); `openapi.json` and the client were regenerated.
- **No migration.** `reviews`, `review_retractions`, their append-only
  triggers, and `reviews_article_version_id_idx` have existed since Sprint 1
  (`0000_initial_schema.sql`, `0001_append_only_triggers.sql`) and fit this
  slice unchanged — the second sprint running (after Evidence) to build against
  a Sprint 1 table with no schema work.
- **Carried over, still carried:** no real chain `AnchorProvider`; no admin
  re-queue for `anchor_failed`; evidence hashes not anchored; no real
  `ObjectStore` / `SourceArchiver` / blob-read endpoint; `RegisterForm`
  unwired; no backend search; the pre-existing millisecond-truncated cursor in
  `articles.repository.ts`.
- **Docker still unavailable** (sixth sprint). Verified via a scratch
  `embedded-postgres` instance outside the repo, torn down after.

## 3. Key Enhancements

- An **approved** reviewer (`reviewers.approval_status = 'approved'`) who is
  **not** a `publisher_members` row for the article's publisher can
  `POST /versions/{versionId}/reviews` with `{ type, comment }` against a
  published (non-draft) version. Any other caller is refused: a non-reviewer, a
  pending reviewer, or an affiliated reviewer all get `403` with a message that
  does not disclose which condition failed.
- Anyone, signed in or not, can `GET /versions/{versionId}/reviews` — cursor
  paginated, each row carrying the reviewer's **public** identity only
  (`displayName`, which is their pseudonym when they chose one, never
  `accounts.fullName`), the review type, the comment, and whether it has been
  retracted. A draft version's reviews `404` — its existence is not disclosed.
- A reviewer can `POST /reviews/{reviewId}/retract` (optionally with a
  `reason`). The review row is never touched; a `review_retractions` row is
  inserted, and every reader now sees `isRetracted: true` with the original
  `comment` still verbatim. Only the review's author can retract it; a second
  retract is a `409`.
- The verification page's **Reviewer Notes** panel (`ReviewerNotes.tsx`) now
  renders the current version's real reviews — reviewer display name and title,
  a type badge, the comment, and a "Retracted" badge with the retraction note
  when present — falling back to the mock row only when no `articleId` is in the
  URL, the same null→mock pattern `EvidenceSection` and `VersionHistory` use.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/reviews.route.ts` → `services/reviews.service.ts`
  → `repositories/reviews.repository.ts`, following the Phase 3 template, plus a
  small `repositories/reviewers.repository.ts` (`findByAccountId` →
  `{ id, approvalStatus }`) used by both the authorizer and the service.
- **`src/auth/can.ts` gained two actions and one dependency.**
  - `review:create` (carries the reviewed article's `publisherId`): true iff
    the actor is an `approved` reviewer **and** not a `publisher_members` row
    for that publisher — the structural conflict-of-interest check, enforced not
    disclosed.
  - `review:retract` (carries the review author's `reviewerAccountId`): true
    iff it equals the actor's `accountId`.
  - `createAuthorization(publishersRepo, reviewersRepo)` — the second parameter
    is new; the three existing call sites were updated.
- **`reviews.repository.ts` builds the wire row with one join set:** `reviews`
  ⨝ `reviewers` ⨝ `accounts` ⟕ `review_retractions`. `isRetracted` /
  `retractedReason` are derived from the LEFT JOIN, never stored on the review.
  A single `baseQuery()` backs the list, the post-insert re-read, and the
  post-retract re-read so the three paths can't drift.
- **Keyset pagination on `reviews.id`**, not `created_at` — the same
  microsecond-vs-millisecond cursor hazard Sprint 5 hit with evidence; order
  within a version's reviews is a flat list, so id order costs nothing.
- **No new dependency**, no new package edge, no new background process.

## 5. Database Changes

**None.** `migrations/` is unchanged. The `reviews` table (`article_version_id`
and `reviewer_id` FKs, `type` enum, `comment`, `created_at`), the
`review_retractions` table (`review_id` FK with a **UNIQUE** constraint —
which is what makes a double-retract a `409` — and a nullable `reason`), the
`reviews_append_only` and `review_retractions_append_only`
`BEFORE UPDATE OR DELETE` triggers, and `reviews_article_version_id_idx` were
all created in Sprint 1. Nothing was added, altered, or dropped. All six
existing migrations were applied to a real Postgres by every integration-test
run this sprint.

## 6. New Components

**Endpoints** (of the 33 in `openapi.json`, 15 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /versions/{versionId}/reviews | public | The version's reviewer notes, cursor-paginated, public reviewer identity only. 404 if the version is unknown or a draft. |
| POST | /versions/{versionId}/reviews | Clerk bearer token | Attach a review to a published version. 403 unless the caller is an approved, non-affiliated reviewer; 404 if the version is unknown or a draft; 400 on a bad body. |
| POST | /reviews/{reviewId}/retract | Clerk bearer token | Retract your own review (a new row; original text untouched). 403 if not the author; 404 if unknown; 409 if already retracted. |

Layering: `routes/reviews.route.ts` → `services/reviews.service.ts` →
`repositories/reviews.repository.ts` (+ `repositories/reviewers.repository.ts`,
`auth/can.ts`) → Postgres.

**`apps/api` new modules:** `repositories/reviewers.repository.ts`,
`repositories/reviews.repository.ts` (`findVersionWithPublisher`, `createReview`,
`findReviewById`, `createRetraction`, `listReviews`),
`services/reviews.service.ts` (`listReviews`, `createReview`, `retractReview`),
`routes/reviews.route.ts`.

**Contract (`packages/shared`):** `paths/reviews.ts` gained `404`/`409`
responses; `openapi.json` and `src/client/schema.d.ts` regenerated (not
hand-edited). No Zod schema changed.

**Frontend** wired to real data, no visual/structural change: `ReviewerNotes`
gains an optional `reviews` prop (null → mock); `VerificationResult` fetches
`GET /versions/{currentVersionId}/reviews` alongside the anchor and evidence
calls and passes it down.

## 7. Sprint Test Results

**Totals: 96 tests, 96 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 56 — up from 38
by the 18 new review tests). No test was weakened to pass; no test failed
during development that required a design change (unlike Sprints 4 and 5).

**`apps/api` — `test/reviews.integration.test.ts`: 18/18** (real Postgres via
`embedded-postgres`, `--no-file-parallelism`):

*GET /versions/:versionId/reviews*
- **404** — unknown version (`code: NOT_FOUND`).
- **404** — draft version (reviews not public).
- **200** — `{ items: [], nextCursor: null }` for a published version with no reviews.
- **list + pagination** — three reviews on one version; `?limit=2` returns 2
  with a string `nextCursor`, the next page returns the last 1 with
  `nextCursor: null`, and the union of pages is exactly the three rows, no
  overlap.

*POST /versions/:versionId/reviews*
- **401** — no `Authorization` header.
- **403** — the actor is not a reviewer at all (`code: FORBIDDEN`).
- **403** — the actor is a *pending* (unapproved) reviewer.
- **403** — the actor is an approved reviewer who is a `publisher_members` row
  for the publisher. **This is the structural conflict-of-interest test** and
  the authenticated-but-unauthorized test for the slice.
- **404** — unknown version.
- **404** — draft version.
- **400** — missing `comment` (`code: VALIDATION_ERROR`).
- **201** — an approved, non-affiliated reviewer: the response carries
  `reviewer.displayName === "Dr. Quill"` (the pseudonym), `reviewer.title`,
  `type`, `comment`, `isRetracted: false`, `retractedReason: null`, and the
  `reviewer` object has **no `fullName`**.

*POST /reviews/:reviewId/retract*
- **401** — no `Authorization` header.
- **404** — unknown review id.
- **403** — a different reviewer tries to retract someone else's review.
- **200** — the author retracts: `isRetracted: true`, `retractedReason` set,
  and `comment` is byte-for-byte the original.
- **409** — a second retract of the same review (`code: CONFLICT`).

*append-only invariant*
- A direct `UPDATE` against `reviews` rejects with `/append-only/`; after a
  retract, a direct `UPDATE` against `review_retractions` rejects the same way.

**Invariant coverage (build prompt Section 1):**
- *Append-only; a retracted review remains visible, marked retracted, with its
  original text intact* — the "retract keeps the original comment" 200 test and
  the two direct-`UPDATE`-rejected assertions. Retraction is an INSERT into
  `review_retractions`, never a mutation of `reviews`.
- *Conflict of interest is structural … enforce it, don't disclose it* — the
  affiliated-reviewer `403` test proves enforcement via `publisher_members`; the
  denial message ("Only an approved reviewer with no affiliation to this
  publisher can review its articles") states the rule but never the caller's
  own affiliation or that a membership row exists.
- *Reviewers are accountable — their record is public* / pseudonymous
  attribution (OPEN_QUESTIONS #10) — the `201` test asserts only
  `reviewerPublicSchema` fields are returned and `accounts.fullName` is not.
- *Reads are public and unauthenticated* — `GET` has no `preHandler`; the two
  draft/unknown `404` tests prove a non-public version discloses nothing.

**Existing suites, unchanged and still green:** `articles.integration.test.ts`
18/18, `evidence.integration.test.ts` 13/13, `anchor.integration.test.ts` 4/4,
`me.integration.test.ts` 3/3; `@sourceit/worker` 7/7; `@sourceit/anchoring`
33/33.

**One type error caught before commit:** the first cut of the test's
`postReview` helper typed its body parameter `unknown`, which made
`app.inject`'s overload resolve to the callback (`void`-returning) form and
broke `.statusCode` access across the file. `tsc --noEmit` (which vitest's
esbuild transform does not run) flagged it; the parameter is now
`Record<string, unknown>`. No production code was involved.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across `apps/api`, `apps/worker`,
`packages/shared`, `packages/anchoring`. No `any`, no `@ts-expect-error`, no
skipped tests. **`apps/web`:** `vite build` succeeds (2204 modules, unchanged
count).

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2 added
the workflow. Docker still unavailable here; `embedded-postgres` remains the
substitute.

## 8. Outcome

**Done and verified against a real Postgres:** `GET` / `POST`
`/versions/{versionId}/reviews` and `POST /reviews/{reviewId}/retract` end to
end — the approved-reviewer gate, the structural conflict-of-interest block with
a non-disclosing denial, public draft-safe listing with cursor pagination,
pseudonymous public identity, and retraction as an append-only row proven from
tests to leave the original review untouched. The frontend Reviewer Notes panel
is wired to the real list. 96/96 tests green.

**Not done, deliberately:**
- **No reviewer-facing write UI.** There is essentially no reviewer frontend in
  the Figma Make export to wire, so submitting or retracting a review from the
  browser would be new component structure — out of scope by the build prompt's
  "may not restructure", as confirmed with the user. `ReviewerNotes`'s mock row
  is retained only as the no-`articleId` fallback.
- **The `publisher`-facing `ReviewsDisputes.tsx` is untouched.** It renders
  reviews *and* disputes in one view; disputes don't exist yet, so wiring half
  of it now would be misleading. It waits for the Dispute slice.
- **Conflict of interest is membership-only.** A reviewer who *used to* work for
  a publisher (self-declared history, the free-text `affiliation` field) is not
  blocked — only a current `publisher_members` row is. This matches the
  Sprint 1 decision (2026-08-26); revisit only if ex-employer COI becomes a
  requirement.
- **`GET /articles/{id}/verification` still unbuilt.** It now needs only
  Dispute data plus the trust-status computation — Evidence and Review both
  exist. TrustSummaryCard and PublisherCredibility on `/verification-result`
  stay on mock data until it lands.

**Known debt incurred:**
- `createAuthorization` now constructs a `reviewersRepo` in three routes
  (`articles`, `publisherArticles`, `evidence`) that never use a review action.
  It is a zero-cost factory call; the alternative (an optional parameter with an
  internal throw) was worse. Acceptable, noted.
- The `review:create` denial message names the rule ("approved reviewer with no
  affiliation"), which reveals that a COI rule exists — but never the caller's
  own status. If even the rule's existence must be opaque, return a bare
  `403`/`404`. Not judged necessary.
- Same pre-existing item as Sprint 5: `articles.repository.ts` still keys its
  cursors on a millisecond-truncated `created_at` ISO string. Repay when those
  endpoints are next touched.

**Blocked on:** nothing.

**Next sprint should do first:** the **Dispute slice** — `disputes` +
append-only `dispute_events`, a reviewer files, a publisher may respond (free
text and/or a correction version) but can never resolve, withdraw, hide, or
delay it (build prompt: "A publisher cannot suppress a dispute against
itself"), current status derived from the latest event. It is the last of the
three inputs `GET /articles/{id}/verification` needs; after it, that composed
endpoint and the trust-status computation become buildable. Alternatively,
account provisioning (`POST /publishers`, `POST /reviewers/apply`) so
`RegisterForm` works. Either way: push to GitHub and confirm CI actually goes
green — it still never has.
