# Sprint 11 — Version Verification

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

Give a published version a way to reach a `verified` trust state, so the
composed `GET /articles/{id}/verification` endpoint can finally return its two
strongest outcomes — `authentic` and `updated` — for data the API created. Since
Sprint 8 the derivation and the frontend have handled all six TrustStatus
values, but no code path moved a version past `pending_review`, so a real
published article could only ever resolve to `authentic_under_review`,
`disputed`, or `publisher_unverified`. This was the single entry in the
project's Open Questions and the "biggest current limitation" line in
`PROJECT_STATE.md`.

Three points were confirmed with the user before implementation: (a) record the
transition as an append-only `version_verifications` child row plus a new
`POST /versions/{id}/verify` endpoint, never as an `UPDATE` of
`article_versions.review_status`; (b) the actor is an approved reviewer with no
structural affiliation to the publisher — the same gate as `review:create` /
`dispute:file`; (c) no anchor precondition — a `pending_review` version can be
verified regardless of whether its Merkle anchor has landed. All three were
built as confirmed. Backend + tests only: there is no reviewer write UI
(`ReviewerPortal.tsx` is a static stub), as with Sprints 7 and 9.

## 2. Changes from Previous Sprint

- **`article_versions.review_status` no longer originates `verified` for
  API-created data.** The enum value is unchanged (schema-frozen, decision
  2026-08-26), but the API never writes it. `verified` is now a **read-time
  overlay** derived from `version_verifications`, in the same spirit as
  `trustStatus` and `credibilityScore` ("computed at read time, never stored").
  The composed endpoint still *honours* a pre-set `review_status = 'verified'`
  if one exists in the row (e.g. from the seed, or a future backfill) — the
  overlay only ever adds `verified`, it never contradicts the column. This kept
  every Sprint 8 verification test green with no edit.
- **`creditAggregate` (the credibility read) now overlays the same
  verification.** Before this sprint `verifiedRatio` was structurally always 0
  because nothing set `review_status = 'verified'`; now a verified current
  version counts toward the publisher's score, matching the frontend's "verified
  articles +10" contributor.
- **`can`'s `review:create` / `dispute:file` switch case gained a third label,
  `version:verify`.** They share the predicate (approved reviewer, not a
  `publisher_members` row for the publisher). The pre-existing note that "a
  future divergence means splitting them" now covers three actions, not two.
- **Migration generation revealed pre-existing snapshot drift.**
  `drizzle-kit generate` emitted two spurious `DROP INDEX` statements for the
  `anchor_records` / `anchor_batches` status indexes that the hand-written 0005
  migration added but never recorded in its Drizzle snapshot. Those lines were
  removed from `0006` by hand (the indexes exist in the database and serve the
  anchoring worker; they are unrelated to this slice). The generated
  `0006_snapshot.json` continues not to carry them, so the spurious diff does
  not recur on the next `generate`. This drift is noted as carryover debt, not
  repaid here.
- **Carried over, still carried:** reader account provisioning; no real Clerk
  Organization (placeholder `clerk_org_id`); the redaction slice
  (`verification` response `redaction` still always `null`); no real chain
  `AnchorProvider`; no admin re-queue for `anchor_failed`; evidence hashes not
  anchored; no real `ObjectStore` / `SourceArchiver` / evidence-blob-read
  endpoint; no backend search; `articles.repository.ts`'s millisecond-truncated
  `created_at` cursor.
- **Docker still unavailable** (eleventh sprint). This session additionally
  found that the `embedded-postgres` prebuilt Windows binaries fail to execute
  from the OS temp directory (an execution-policy block:
  `STATUS_DLL_INIT_FAILED`). Verification was done against a real PostgreSQL 16
  driven directly from `initdb` / `pg_ctl` on a non-temp path — see §7.

## 3. Key Enhancements

- `POST /versions/{versionId}/verify` (Clerk bearer token) — an approved
  reviewer with no structural affiliation to the publisher records that they
  have verified a published version. No request body. Returns
  `versionVerificationSchema` (`{ id, articleVersionId, verifiedBy: { id,
  displayName, title }, createdAt }`); `verifiedBy` uses the same pseudonym-aware
  public identity as a review's `reviewer`, and `accounts.fullName` is never
  exposed. Append-only; a version can be verified once (`409` on a repeat).
  `401` no session, `403` affiliated / not-approved, `404` unknown or
  draft version (existence not leaked).
- `GET /articles/{articleId}/verification` now reports a verified current
  version as `currentVersion.reviewStatus: "verified"` and, for a first version
  on a verified publisher with no open dispute, `trustStatus: "authentic"`; a
  verified version past v1.0 resolves to `"updated"`. `versionHistory` entries
  carry the same overlay so no single payload contradicts itself. An open
  dispute still outranks a verification (`"disputed"`) — the status is
  precedence, not a downgrade of the underlying row.
- A verified article now moves the publisher's `credibilityScore` (its
  `verifiedRatio` term is finally reachable).

## 4. Architecture Changes

- **New in `apps/api`:** `routes/versionVerification.route.ts` →
  `services/versionVerification.service.ts` →
  `repositories/versionVerifications.repository.ts` → Postgres. One new
  repository (thin: `findByVersionId`, `create`), one new single-method service.
- **`verification.repository.ts` gained `findVerifiedVersionIds(ids)`** — one
  `IN` query returning the set of verified version ids, mirroring the existing
  `findVersionIdsWithOpenDispute`. Used by the composed read and, batched inside
  `creditAggregate`, by the credibility read. No N+1.
- **No new dependency, no new package edge, no background process, no new
  authorization primitive** (the `version:verify` action reuses the
  reviewer-COI predicate that has existed since Sprint 6).
- The append-only trigger family is untouched; `version_verifications` gets its
  own trigger bound to the shared `reject_update_delete()` function from 0001,
  exactly like `reviews` / `review_retractions` / `dispute_events`.

## 5. Database Changes

**`migrations/0006_version_verifications.sql`** — one new table, append-only.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` PK | no | `gen_random_uuid()` |
| `article_version_id` | `uuid` | no | FK → `article_versions(id)`; **UNIQUE** |
| `reviewer_id` | `uuid` | no | FK → `reviewers(id)` |
| `created_at` | `timestamptz` | no | `now()` |

- **UNIQUE (`article_version_id`)** enforces "a version is verified at most
  once"; the service pre-checks and maps a hit to `409`, the constraint is the
  backstop.
- **FK `reviewer_id → reviewers(id)`** (not `accounts`): the verifier is always
  an approved reviewer, so the row points at the reviewer profile, and the
  public-identity join matches the reviews join exactly.
- **Trigger `version_verifications_append_only`** — `BEFORE UPDATE OR DELETE …
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete()`. Verified in a live
  database: `UPDATE` and `DELETE` both raise
  `version_verifications is append-only: … is not permitted`.
- No index beyond the UNIQUE constraint (which Postgres backs with a unique
  index) — lookups are all by `article_version_id`, equality or `IN`.
- No destructive or irreversible change. Rolling back 0006 drops an
  otherwise-unreferenced table; `article_versions.review_status` is unaffected
  (the API never wrote it).
- Two spurious `DROP INDEX` lines that `drizzle-kit generate` produced were
  removed by hand (see §2).

## 6. New Components

**Endpoint** (of the 34 now in `openapi.json`, 28 implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | /versions/{versionId}/verify | Clerk bearer token | Approved non-affiliated reviewer verifies a published version. 401 no session, 403 affiliated / not approved, 404 unknown or draft version, 409 already verified. |

Layering: `routes/versionVerification.route.ts` →
`services/versionVerification.service.ts` →
`repositories/versionVerifications.repository.ts` → Postgres.

**`apps/api` new modules:** `repositories/versionVerifications.repository.ts`
(`findByVersionId`, `create`), `services/versionVerification.service.ts`
(`verifyVersion`, `toApiVersionVerification`),
`routes/versionVerification.route.ts`.
**`apps/api` changed:** `auth/can.ts` (+`version:verify` action, shared case,
denial message); `repositories/verification.repository.ts`
(+`findVerifiedVersionIds`, overlay in `creditAggregate`);
`services/verification.service.ts` (verified overlay on `currentVersion`,
`versionHistory`, and the `deriveTrustStatus` input); `app.ts` (route
registration).

**Contract (`packages/shared`):** new `db/schema/version-verifications.ts`;
new `zod/verifications.ts` (`versionVerificationSchema`); new
`openapi/paths/verifications.ts`; `migrations/0006_version_verifications.sql`
(+ journal entry + snapshot); `openapi.json` and `src/client/schema.d.ts`
regenerated, not hand-edited.

**Seed:** one `version_verifications` row — v1.0 of The Daily Planet's article,
verified by the approved, non-affiliated reviewer (v2.0 is left unverified: it
carries an open dispute).

## 7. Sprint Test Results

**Totals: 185 tests, 185 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 145 — up from
132 by the 13 new version-verification tests). No test was weakened, skipped, or
deleted. `pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings across all four
packages. No `any`, no `@ts-expect-error`. `apps/web`: `vite build` succeeds
(2204 modules, unchanged).

**`apps/api` — `test/versionVerification.integration.test.ts`: 13/13** (real
Postgres, `--no-file-parallelism`):

*`POST /versions/:versionId/verify`* — `401` no session; `404` unknown version;
`404` draft version (existence not leaked); `403` non-reviewer account; `403`
unapproved (pending) reviewer; `403` structurally affiliated reviewer
(conflict of interest); **`201` happy path** — response is the public identity
only (`displayName` / `title`, never `fullName`), and exactly one
`version_verifications` row exists afterward; **`409`** on a second verification
of the same version.

*append-only invariant* — a direct `UPDATE` and a direct `DELETE` against
`version_verifications` each reject with `/append-only/`.

*effect on `GET /articles/:articleId/verification`* — a just-submitted v1.0
moves from `authentic_under_review` → `authentic` once verified, and
`currentVersion` + `versionHistory[0]` both report `reviewStatus: "verified"`;
a verified current version past v1.0 reports `updated`; an open dispute keeps
`disputed` outranking the verification while the underlying version stays
`verified`; verifying a publisher's only article raises its `credibilityScore`
from 60 to 100 (`verifiedRatio` 0 → 1).

**Invariant / standard coverage (build prompt Section 1):**
- *Append-only* — DB-level trigger proven to block `UPDATE`/`DELETE`; the
  transition is a new row, never a mutation of `article_versions`.
- *Conflict of interest is structural* — the `403` for an affiliated reviewer
  goes through the same `publisher_members` predicate as `review:create`; the
  denial message names the rule, never the caller's affiliation.
- *Authorization via `can`* — every path (`401` / `403` affiliated / `403` not
  approved / `404` / `409` / `201`) is covered; `version:verify` is a `can`
  action, not a route conditional.
- *"Verified" is not a database flag someone sets* — `article_versions
  .review_status` is never written to `verified` by the API; the state is
  derived at read time from an append-only attestation row.

**Existing suites, unchanged and still green:** `articles` 18, `evidence` 13,
`reviews` 18, `disputes` 31, `verification` 11 (**no edit needed** — the
overlay-only approach preserved every assertion), `trust` 12, `admin` 12,
`anchor` 4, `me` 3, `registration` 10; `@sourceit/worker` 7;
`@sourceit/anchoring` 33.

**Verification environment.** Docker is still unavailable (eleventh sprint).
This session the usual fallback — `embedded-postgres` — additionally failed:
its prebuilt Windows binaries will not execute from the OS temp directory on
this host (`initdb.exe --version` exits `0xC0000142` `STATUS_DLL_INIT_FAILED`,
reproduced on the PG 15 / 16 / 18 builds). Copied to a non-temp path
(`D:\…`) the same binaries run normally, which pins the cause to a path-based
execution policy on `%LOCALAPPDATA%\Temp`. All results above were produced
against a real **PostgreSQL 16.14** initialised with `initdb` and started with
`pg_ctl` from that non-temp path, `TEST_DATABASE_URL` pointed at it,
`vitest run --no-file-parallelism`. All 7 migrations (0000–0006) apply cleanly
to a fresh database; the seed (incl. the new `version_verifications` row) runs;
the append-only trigger and all four constraints were inspected directly in the
live catalog. The instance was stopped and its data directory removed
afterward; no process holds port 55432.

**Not run in CI.** Unchanged carryover — nothing has been pushed since Sprint 2
added the workflow. Sprints 9 and 10 were committed since the last session
(git log confirms); Sprint 11 is awaiting commit — see the commit plan.

## 8. Outcome

**Done and verified against a real Postgres:** `POST /versions/{id}/verify` end
to end — the approved-non-affiliated-reviewer gate, the append-only row, the
once-per-version `409`, the draft/unknown `404`, and the public-identity-only
response. The composed verification endpoint now reaches `authentic` and
`updated` for API-created data, `versionHistory` stays internally consistent,
`disputed` still outranks, and the credibility `verifiedRatio` term is live.
185/185 tests green; migrations + seed + trigger confirmed in a live database.

**Not done, deliberately or blocked:**
- **No reviewer write UI.** `ReviewerPortal.tsx` is still a static
  "Login Successful" stub — there is no reviewer frontend to wire, exactly as
  in Sprints 6, 7, 9. A reviewer verifies via the raw endpoint.
- **No "un-verify" / revocation.** A verification is permanent. If a version is
  later found wanting, the mechanisms are a dispute (which outranks it in the
  trust output) or a correction (a new version, itself unverified until a
  reviewer verifies it). No endpoint removes a `version_verifications` row, and
  the append-only trigger forbids it. Revisit only if a real revocation
  workflow is asked for.
- **No verifier identity in the composed read.** `GET /articles/{id}/verification`
  reports *that* the current version is verified (`reviewStatus: "verified"`),
  not *who* verified it or *when*. The `version_verifications` row records
  author + timestamp for audit; surfacing it in the public payload is a small,
  additive follow-up, deferred to keep this slice's contract change minimal.
- **`article_versions.review_status = 'verified'` is now dead as an API
  outcome** but still a valid enum value and still honoured by the read overlay
  if present. If a future slice wants the column to be authoritative again it
  needs its own trigger/schema decision — this sprint deliberately did not
  reopen that.
- **Credibility is still computed only at read time.** The cached
  `publishers.credibility_score` column and `credibility_score_history` table
  remain unwritten (publisher-dashboard slice).

**Known debt incurred:**
- **Drizzle snapshot drift for the anchoring status indexes is now two
  migrations deep.** `schema/anchoring.ts` does not define
  `anchor_records_status_idx` / `anchor_batches_status_idx` (0005 added them as
  hand-written SQL), so every `drizzle-kit generate` wants to `DROP` them; 0006
  had those lines removed by hand. Repay by adding the two indexes to the
  Drizzle schema (or accepting the snapshot as the source of truth) the next
  time the anchoring schema is touched.
- The new repository's `create` does a second round-trip to re-select the
  identity-joined row after insert — the same pattern as
  `reviews.repository.createReview`. Acceptable; it keeps the service free of
  join SQL.
- `versionVerification.service.ts` imports nothing from `reviews.service.ts`
  but re-implements the identical `displayName` derivation (three lines). If a
  third consumer appears, extract a shared `toDisplayName(reviewerRow)`.

**Blocked on:** nothing.

**Next sprint should do first:** one of the remaining slices — **reader
features** (saved-articles + publisher-follows, needs reader account
provisioning — extend Sprint 10's pattern), the **redaction** slice (the
`verification` response's `redaction` field is wired and still always `null`),
or the **publisher-dashboard reads** (`GET /publishers/{id}`, `/analytics`,
`/activity`, `/credibility`, `/credibility-history`, `/reviews`; may write the
cached credibility columns). Independently: **push to GitHub and confirm CI
actually goes green — it still never has**, and note that Sprint 11 is awaiting
commit.
