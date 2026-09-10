# Sprint 10 — Account Provisioning

**Dates:** 2026-09-09 → 2026-09-09  ·  **Status:** Complete with carryover

## 1. Objective

Close the self-service registration loop. A person can now sign up through
`RegisterForm.tsx` — Clerk creates the user, and `POST /publishers` or
`POST /reviewers/apply` materializes their local `accounts` mirror row and the
role-specific profile. This is the last slice with real frontend to wire, and it
feeds Sprint 9's admin queues: a publisher lands as `unverified` and a reviewer
as `pending`, both waiting for an admin decision. Until this sprint the only way
an `accounts` row existed was a hand-written `INSERT` in a test fixture.

Four points were confirmed with the user before implementation: build this slice;
materialize the `accounts` row lazily on the first authed write (identity from
the request body, keyed by the verified `clerkUserId`); use a placeholder
`clerk_org_id` and defer real Clerk Organizations behind a seam; and wire the
publisher + reviewer paths of `RegisterForm` with a real Clerk `useSignUp`. All
four were built as confirmed.

## 2. Changes from Previous Sprint

- **`createPublisherRequestSchema` and `applyAsReviewerRequestSchema` each
  gained `fullName` and `email`.** The endpoints run behind a session-only
  guard and need the identity fields to build the `accounts` mirror row; the
  Clerk session token carries only `sub` (the user id). The trusted key is
  still the verified `clerkUserId` — these fields mirror the Clerk profile,
  they do not authenticate. Documented inline; `openapi.json` and the client
  were regenerated. `POST /publishers` and `POST /reviewers/apply` also gained
  `401` / `409` responses (and `/reviewers/apply` a `400`), which the Sprint 1
  paths omitted.
- **`accounts.repository.ts` gained `findByEmail` and `ensureAccount`.**
  `ensureAccount` is idempotent on `clerkUserId`: a row that already exists is
  returned unchanged, so a later call with a different `role` / `email` /
  `fullName` does not overwrite it.
- **`admin.service.ts`'s `toApiPublisher` / `toApiReviewer` are now exported**
  and reused by the registration service so the created-resource response
  matches the queue response exactly.
- **No migration.** `accounts`, `publishers` (incl. `clerk_org_id`),
  `publisher_members`, and `reviewers` are all Sprint 1 tables with room for
  this flow.
- **Carried over, still carried:** reader account provisioning (no endpoint —
  `RegisterForm`'s reader path stays a local stub); no real Clerk Organization
  (placeholder `clerk_org_id`); version-verification transition (still
  unreachable `authentic`/`updated`); redaction slice; no real chain
  `AnchorProvider`; no admin re-queue for `anchor_failed`; evidence hashes not
  anchored; no real `ObjectStore` / `SourceArchiver` / evidence-blob-read
  endpoint; no backend search; the pre-existing millisecond-truncated cursor in
  `articles.repository.ts`.
- **Docker still unavailable** (tenth sprint). Verified via a scratch
  `embedded-postgres` instance outside the repo.
- **Sprint 9 was not committed before this sprint began** — the working tree
  now holds Sprint 9's admin-queue changes and this sprint's together. They do
  not conflict (different endpoints, different repository methods); the commit
  plans stay separate.

## 3. Key Enhancements

- `POST /publishers` (valid Clerk session, local account optional) — body
  `{ fullName, email, organizationName, website, description }`. Creates or
  reuses the caller's `accounts` row (role `publisher`), creates the publisher
  with `verification_status = 'unverified'` and a generated
  `clerk_org_id = "local_org_<uuid>"`, and adds the caller as an `owner`
  `publisher_members` row. Returns `publisherSchema`. A person may own more than
  one publisher — a repeat call creates another, reusing the one account row.
- `POST /reviewers/apply` (valid Clerk session) — body
  `{ fullName, email, affiliation, expertise, applicationReason }`. Creates or
  reuses the caller's `accounts` row (role `reviewer`) and a `reviewers` profile
  with `approval_status = 'pending'`. Returns `reviewerSchema`. One reviewer
  profile per account — a second application is a `409`.
- Both `401` a missing/invalid session, `400` a malformed body, and `409` an
  email already registered to a different account.
- After registering, `GET /me` works for that session (the account row now
  exists), and a `pending` reviewer appears in `GET /reviewers/pending`.
- `RegisterForm.tsx`'s publisher and reviewer paths are real: Clerk's headless
  `useSignUp` creates the user (with an email-code verification sub-view when
  Clerk requires one, mirroring `LoginForm`'s second-factor step), then the API
  call creates the profile and the success banner reflects the real outcome.

## 4. Architecture Changes

- **New in `apps/api`:** `routes/registration.route.ts` →
  `services/registration.service.ts` → the `accounts` / `publishers` /
  `reviewers` repositories. No new repository — the three added methods live on
  the existing ones.
- **The two registration routes use `requireAuth`, not `requireActor`.**
  `requireAuth` verifies the Clerk session and attaches `{ clerkUserId }`
  without requiring a local account; the service creates that account. Every
  other authed route keeps `requireActor` (which 401s without an account row).
- **`clerk_org_id` is a local placeholder.** `POST /publishers` generates
  `local_org_<uuid>`; real Clerk Organization creation / membership sync is a
  later concern behind that column and `publisher_members` — the same seam call
  Sprints 4–5 made for `AnchorProvider` / `ObjectStore` / `SourceArchiver`.
- **No new dependency**, no new package edge, no background process, no schema
  change.

## 5. Database Changes

**None.** `migrations/` is unchanged. `POST /publishers` inserts an `accounts`
row (when absent), a `publishers` row, and a `publisher_members` row;
`POST /reviewers/apply` inserts an `accounts` row (when absent) and a
`reviewers` row. All columns and the `accounts.clerk_user_id` /
`accounts.email` unique constraints and the `reviewers.account_id` unique
constraint (which enforces "one reviewer profile per account") have existed
since `0000_initial_schema.sql`.

## 6. New Components

**Endpoints** (of the 33 in `openapi.json`, 27 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | /publishers | Clerk session (account materialized) | Register a publisher org; caller becomes an owner member. 400 bad body, 401 no session, 409 email clash. |
| POST | /reviewers/apply | Clerk session (account materialized) | Apply to be a reviewer (approval_status=pending). 400 bad body, 401 no session, 409 already applied / email clash. |

Layering: `routes/registration.route.ts` → `services/registration.service.ts` →
`repositories/{accounts,publishers,reviewers}.repository.ts` → Postgres.

**`apps/api` new modules:** `services/registration.service.ts`
(`registerPublisher`, `applyAsReviewer`), `routes/registration.route.ts`.
**Repository methods added:** `accountsRepo.findByEmail` / `ensureAccount`;
`publishersRepo.createPublisher` / `addMember`; `reviewersRepo.createReviewer`.
**Exports added:** `toApiPublisher` / `toApiReviewer` from `admin.service.ts`.

**Contract (`packages/shared`):** `fullName` + `email` added to the two request
schemas; `401` / `409` (+ `400`) responses added to the two paths;
`openapi.json` and `src/client/schema.d.ts` regenerated.

**Frontend:** `RegisterForm.tsx` — publisher + reviewer paths wired to Clerk
`useSignUp` + the real endpoints, with an email-code verification sub-view. The
reader path, the field markup, and the visual layer are unchanged.

## 7. Sprint Test Results

**Totals: 172 tests, 172 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 132 — up from
122 by the 10 new registration tests). No test was weakened to pass.

**`apps/api` — `test/registration.integration.test.ts`: 10/10** (real Postgres,
`--no-file-parallelism`):
- `POST /publishers` — `401` no session; `400` malformed body (bad email);
  **`201` happy path**: response is an `unverified` publisher with the default
  `credibilityScore: 0` / `transparencyLevel: 3`, a new `accounts` row exists
  with the body's `email` / `fullName` and role `publisher`, the publisher's
  `clerk_org_id` matches `/^local_org_/`, a `publisher_members` row makes the
  caller an `owner`, and `GET /me` for that session now `200`s with the
  publisher id; **second registration** by the same session creates a second
  publisher and leaves exactly one `accounts` row; **`409`** when the email is
  already on a different `clerkUserId`.
- `POST /reviewers/apply` — `401` no session; `400` malformed body; **`201`
  happy path**: a `pending` reviewer profile, an `accounts` row with role
  `reviewer`, and the profile shows up in `GET /reviewers/pending` for an
  admin; **`409`** on a second application from the same account; **`409`**
  when the email is on a different account.

**Invariant / standard coverage:**
- *One source of truth for identity* — the account is keyed by the verified
  `clerkUserId`; `fullName` / `email` from the body are the profile mirror,
  and `ensureAccount` never overwrites an existing row.
- *Layering* — route (`requireAuth` + Zod) → service → repository; the service
  does no SQL, the repositories no HTTP.
- *Standard 4xx matrix* — `401` (no session), `400` (bad body), `409`
  (conflict) are each covered for both endpoints; there is no `403` path
  (any signed-in user may register).
- *Reviewer approval has a real admin queue* (decision 2026-08-26) — the
  registration test proves an application created through the API shows up in
  the Sprint 9 queue, closing that loop.

**Existing suites, unchanged and still green:** `articles` 18/18, `evidence`
13/13, `reviews` 18/18, `disputes` 31/31, `verification` 11/11, `trust` 12/12,
`admin` 12/12, `anchor` 4/4, `me` 3/3; `@sourceit/worker` 7/7;
`@sourceit/anchoring` 33/33.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across all four packages. No `any`,
no `@ts-expect-error`, no skipped tests. **`apps/web`:** `vite build` succeeds
(2204 modules, unchanged) with the wired `RegisterForm`.

**`RegisterForm` is not integration-tested** — driving Clerk's headless
`useSignUp` needs a live Clerk project, the one external dependency the test
suite deliberately fakes. The API side (behind the fake verifier) is fully
covered; the frontend change follows `LoginForm`'s already-proven pattern.

**Not run in CI.** Unchanged carryover — nothing pushed since Sprint 2.

## 8. Outcome

**Done and verified against a real Postgres:** both registration endpoints end
to end — lazy account materialization keyed by the verified session, the
role-specific profile, the owner-membership wiring for publishers, the
one-profile-per-account rule for reviewers, the email-uniqueness conflict, and
the hand-off into Sprint 9's queues. `RegisterForm`'s publisher and reviewer
paths are wired to real Clerk sign-up. 172/172 tests green.

**Not done, deliberately or blocked:**
- **Reader account provisioning.** There is no endpoint and no `accounts` row
  is created for a reader; `RegisterForm`'s reader path keeps its local
  confirmation. Readers need no account until the reader-features slice
  (saved-articles, publisher-follows), which will need this.
- **No real Clerk Organization.** `clerk_org_id` is a generated placeholder and
  `publisher_members` is our own table, not synced to Clerk. A real
  Organization create/sync plugs in at that column with no route change.
- **`ensureAccount` is first-writer-wins on `role`.** A reviewer who later
  registers a publisher keeps role `reviewer` (and vice versa) — one `accounts`
  row, one role. Deliberate; revisit if multi-role accounts are ever required.
- **`RegisterForm` end-to-end path is unverified here** (needs live Clerk); see
  §7.

**Known debt incurred:**
- The three new repository insert methods (`createPublisher`, `addMember`,
  `createReviewer`) are thin pass-throughs; acceptable, they keep the service
  free of SQL.
- The registration service imports `toApiPublisher` / `toApiReviewer` from
  `admin.service.ts` — the mappers' home is arbitrary (both services are
  consumers). Move to a `mappers.ts` if a third consumer appears.
- Same pre-existing item as Sprints 5–9: `articles.repository.ts` cursor
  pagination keys on a millisecond-truncated `created_at` ISO string.

**Blocked on:** nothing.

**Next sprint should do first:** either the **reader-features** slice
(saved-articles + publisher-follows, which needs reader account provisioning —
extend this sprint's pattern), the **version-verification** slice (needs a
contract + append-only-trigger decision, and unblocks `authentic`/`updated`
TrustStatus), the **redaction** slice, or the **publisher-dashboard reads**
(`GET /publishers/{id}`, `/analytics`, `/activity`, `/credibility`,
`/credibility-history`, `/reviews`). Either way: **push to GitHub and confirm CI
actually goes green — it still never has**, and note that Sprints 9 and 10 are
both awaiting commit.
