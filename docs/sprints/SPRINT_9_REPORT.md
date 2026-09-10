# Sprint 9 — Admin Decision Queues

**Dates:** 2026-09-09 → 2026-09-09  ·  **Status:** Complete with carryover

## 1. Objective

Turn the `admin` role — created at the Sprint 1 stop point for exactly this —
into working machinery. A site admin can now list the publishers awaiting
verification and the reviewers awaiting approval, and approve or reject each.
Until this sprint both were manual database edits (the Sprint 8 verification
tests literally `UPDATE`d `publishers.verification_status` by hand to set up
their fixtures); now they are real endpoints, gated by a single `admin`
authorization action, with the decision, its author, and its timestamp recorded.
This also makes the reviewer conflict-of-interest gate meaningful end to end: a
`pending` reviewer is refused, an admin approves them through the API, and the
same reviewer's next `POST /versions/{id}/reviews` succeeds.

Per the user's confirmation this slice is **backend + tests only** — there is no
admin surface anywhere in the Figma Make export (OPEN_QUESTIONS.md #8), and
building one is net-new component structure.

The objective was met. Nothing in it was blocked.

## 2. Changes from Previous Sprint

- **`can.ts` gained an `{ type: "admin" }` action** — a plain
  `actor.role === "admin"` check, the fourth thing `Actor.role` is now used for
  (after `dispute:resolve`). No resource; the two admin queues and their two
  decision endpoints all route through it.
- **`publishers.repository.ts` and `reviewers.repository.ts` each gained a
  status-filtered keyset list and a decision writer** (`listByStatus` /
  `setVerification`; `listByStatus` / `setApproval`, plus `findById` on the
  reviewer repo). The publisher repo's existing `isMember` / `isVerified` /
  `findById` are unchanged.
- **`POST /publishers/{id}/verification` and `POST /reviewers/{id}/decision`
  gained a `404` response** in the contract (the Sprint 1 paths listed only
  `200` and `403`). Additive amendment, no body shape changed; `openapi.json`
  and the client were regenerated.
- **No migration.** `publishers.verification_status` / `verified_at` /
  `verified_by_account_id` and `reviewers.approval_status` / `approved_at` /
  `approved_by_account_id` have existed since Sprint 1 and fit unchanged.
- **Carried over, still carried:** no version-verification transition
  (`pending_review → verified` still unreachable — see §8); no dispute frontend;
  no reviewer-facing write UI; `RegisterForm` unwired; redaction slice unbuilt;
  no real chain `AnchorProvider`; no admin re-queue for `anchor_failed`;
  evidence hashes not anchored; no real `ObjectStore` / `SourceArchiver` /
  evidence-blob-read endpoint; no backend search; the pre-existing
  millisecond-truncated cursor in `articles.repository.ts`.
- **Docker still unavailable** (ninth sprint). Verified via a scratch
  `embedded-postgres` instance outside the repo.

## 3. Key Enhancements

- `GET /publishers/pending-verification` (admin) — the publishers with
  `verification_status = 'pending'`, cursor-paginated as `publisherSchema[]`.
- `POST /publishers/{publisherId}/verification` (admin) — body
  `{ decision: "verified" | "rejected" }`. Sets the status, records
  `verified_by_account_id`, sets `verified_at` on a `verified` decision and
  clears it on a `rejected` one, and returns the updated `publisherSchema`.
- `GET /reviewers/pending` (admin) — the reviewers with
  `approval_status = 'pending'`, cursor-paginated as `reviewerSchema[]`.
- `POST /reviewers/{reviewerId}/decision` (admin) — body
  `{ decision: "approved" | "rejected" }`. Sets the status, records
  `approved_by_account_id`, sets/clears `approved_at`, returns the updated
  `reviewerSchema`.
- All four refuse a missing token (`401`) and a non-admin (`403`); the two
  decisions `404` an unknown id and `400` a malformed body.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/admin.route.ts` → `services/admin.service.ts` →
  the existing `publishers` / `reviewers` repositories. No new repository — the
  two decision domains already had a repo each; this sprint added methods to
  them.
- **One authorization action for all four endpoints.** `admin.service` calls
  `authz.assertCan(actor, { type: "admin" })` first in every method; the route
  layer holds no role conditional.
- **Decision endpoints are permissive on the current state.** An admin may
  verify a `pending` publisher, reject an application, or revoke a
  previously-granted verification (`verified → rejected`); likewise for
  reviewers. Only an unknown id is a `404`. The "rejected is terminal" decision
  (2026-08-26) constrains the *applicant* (they can't self-retry), not the
  admin's ability to change a standing decision.
- **No new dependency**, no new package edge, no background process, no schema
  change, no frontend change.

## 5. Database Changes

**None.** `migrations/` is unchanged. The endpoints read and write columns that
have existed since `0000_initial_schema.sql`:
`publishers.verification_status` / `verified_at` / `verified_by_account_id` (FK
to `accounts`) and `reviewers.approval_status` / `approved_at` /
`approved_by_account_id` (FK to `accounts`), plus the
`publishers_verification_status_idx` and `reviewers_approval_status_idx` indexes
that serve the two queue scans. No column, index, constraint, or trigger was
added or changed.

## 6. New Components

**Endpoints** (of the 33 in `openapi.json`, 25 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /publishers/pending-verification | admin | The publisher verification queue, cursor-paginated. 403 for a non-admin. |
| POST | /publishers/{publisherId}/verification | admin | Approve / reject / revoke a publisher's verification. 403 non-admin, 404 unknown, 400 bad body. |
| GET | /reviewers/pending | admin | The reviewer approval queue, cursor-paginated. 403 for a non-admin. |
| POST | /reviewers/{reviewerId}/decision | admin | Approve / reject a reviewer application. 403 non-admin, 404 unknown, 400 bad body. |

Layering: `routes/admin.route.ts` → `services/admin.service.ts` →
`repositories/{publishers,reviewers}.repository.ts` → Postgres.

**`apps/api` new modules:** `services/admin.service.ts` (`listPendingPublishers`,
`decidePublisher`, `listPendingReviewers`, `decideReviewer`),
`routes/admin.route.ts`. **Repository methods added:**
`publishersRepo.listByStatus` / `setVerification`; `reviewersRepo.findById` /
`listByStatus` / `setApproval`. **Authorization:** `can.ts` `{ type: "admin" }`.

**Contract (`packages/shared`):** `paths/publishers.ts` and `paths/reviewers.ts`
each gained a `404` on their decision `POST`; `openapi.json` and
`src/client/schema.d.ts` regenerated.

**Frontend:** none.

## 7. Sprint Test Results

**Totals: 162 tests, 162 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 122 — up from
110 by the 12 new admin tests). No test was weakened to pass; nothing failed
during development that forced a design change.

**`apps/api` — `test/admin.integration.test.ts`: 12/12** (real Postgres,
`--no-file-parallelism`):
- `GET /publishers/pending-verification` — `401` no token; `403` non-admin
  (`code: FORBIDDEN`); `200` admin returns *only* `pending` publishers and
  includes the seeded one.
- `POST /publishers/{id}/verification` — `403` non-admin; `404` unknown id;
  `400` bad `decision` (`code: VALIDATION_ERROR`); `200` verify a pending
  publisher → `verificationStatus: "verified"`, `verified_by_account_id` and
  `verified_at` set (checked by direct DB read), and it leaves the queue;
  `200` reject an application; `200` revoke a standing verification
  (`verified → rejected`).
- `GET /reviewers/pending` — `403` non-admin; `200` admin returns only
  `pending` reviewers, includes the pending one, excludes the approved one.
- `POST /reviewers/{id}/decision` — `403` non-admin, `404` unknown, `400` bad
  decision; `200` approve → `approvalStatus: "approved"`,
  `approved_by_account_id` / `approved_at` set, leaves the queue, **and the
  just-approved reviewer's next `POST /versions/{id}/reviews` returns 201**
  (the same account was refused while `pending`); `200` reject an application.

**Invariant / decision coverage:**
- *Reviewer approval has a real admin queue and `admin` role, not manual
  database edits* (decision 2026-08-26) — now actually implemented and tested,
  including the end-to-end proof that approval changes what the reviewer can do.
- *Publisher verification: unverified → pending → verified, plus a rejected
  terminal state, approved by an `admin`-role account* (decision 2026-08-26) —
  the decision endpoint drives every transition; the queue scans `pending`.
- *Authorization never lives in a route conditional* — every admin method calls
  `authz.assertCan(actor, { type: "admin" })`; the negative test for each
  endpoint proves a non-admin gets `403`.
- *Reads are... [admin] — do not put auth in front of [public reads]* — these
  are explicitly admin-only management reads, not the public verification path;
  they carry `preHandler: requireActor` and the `admin` gate.

**Existing suites, unchanged and still green:** `articles` 18/18, `evidence`
13/13, `reviews` 18/18, `disputes` 31/31, `verification` 11/11, `trust` 12/12,
`anchor` 4/4, `me` 3/3; `@sourceit/worker` 7/7; `@sourceit/anchoring` 33/33.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across all four packages. No `any`,
no `@ts-expect-error`, no skipped tests. **`apps/web`:** `vite build` succeeds
(2204 modules, unchanged) against the regenerated client.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2.

## 8. Outcome

**Done and verified against a real Postgres:** both admin queues and both
decision endpoints end to end — the single `admin` gate, the
approve/reject/revoke semantics, the recorded decision author and timestamp,
queue membership tracking the status, and the end-to-end proof that approving a
reviewer changes what they can do. 162/162 tests green.

**Not done, deliberately or blocked:**
- **`reviewerSchema` in the approval queue carries no applicant identity and no
  `applicationReason`** (id, affiliation, expertise, title, pseudonym,
  useLegalName, approvalStatus, createdAt only). An admin approving from this
  payload alone is deciding on affiliation and expertise without seeing who
  applied or why. This is the frozen Sprint 1 shape; enriching it (e.g. adding
  `applicationReason` and a name/email) is a contract amendment left for when a
  real admin UI is built.
- **No admin UI.** Confirmed with the user — no surface exists in the export.
- **Version verification is still unbuilt**, so `authentic` / `updated`
  TrustStatus remain unreachable for API-created data (Sprint 8 §8). The admin
  role is now wired for the two queues it was designed for; a reviewer/admin
  "verify this version" transition is a separate slice that needs a contract
  and (because the append-only trigger forbids `UPDATE` on a non-draft version)
  a schema/trigger decision.
- **Decision endpoints don't reject a no-op** (e.g. verifying an
  already-verified publisher). They are idempotent-ish and simply re-write the
  same status; no `409`. Judged simpler and more useful than a state-machine
  guard.

**Known debt incurred:**
- The two `listByStatus` methods and the two `set*` decision writers are
  near-identical across the publisher and reviewer repos (~15 lines each). Not
  worth a shared abstraction for two call sites; noted.
- Same pre-existing item as Sprints 5–8: `articles.repository.ts` cursor
  pagination keys on a millisecond-truncated `created_at` ISO string.

**Blocked on:** nothing.

**Next sprint should do first:** **account provisioning** — `POST /publishers`
and `POST /reviewers/apply` plus local `accounts` creation via the confirmed
Clerk headless-hook approach, and wire `RegisterForm.tsx`. It is the last slice
with real frontend to wire, and it closes the loop with this sprint's queues
(an application has to exist before an admin can approve it). Alternatively, the
**version-verification** slice (needs a contract + trigger decision first) to
make `authentic` / `updated` reachable, or the **redaction** slice. Either way:
push to GitHub and confirm CI actually goes green — it still never has.
