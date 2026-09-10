# SourceIt — Project State
**Last updated:** end of Sprint 15  ·  **Current phase:** Phase 5 complete — the build-prompt phase structure is done

> **Sprint 15 is awaiting commit** — the working tree holds it. Commit plan is
> in the closing message. Sprint 14 was committed (git log confirms).

## Resume here

**Phase 5 (Hardening) is done.** Phases 0–4 built the contract, skeleton, and
every vertical slice (all 44 `openapi.json` operations); Sprint 15 hardened it:

- **Rate limiting** (`apps/api/src/plugins/rateLimit.ts`, `@fastify/rate-limit`):
  one global per-IP budget for reads (`RATE_LIMIT_MAX`, default 300 / minute), a
  tighter one for every mutating method (`RATE_LIMIT_WRITE_MAX`, default 30) via
  an `onRoute` hook, keyed by the first `X-Forwarded-For` hop else the socket
  address. `/healthz` + `/readyz` exempt. `429` → `{ code: "RATE_LIMITED" }`.
  Per-instance — a Redis store swap is documented for multi-instance.
- **`buildApp` is now `async`** (`await buildApp(...)`) — the rate-limit plugin
  must be `await`ed before routes register or Fastify v5 silently drops its
  global hook.
- **Error handler**: a framework `4xx` (`error.statusCode` 400–499) maps onto
  `{ code, message }` — `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`,
  `429 RATE_LIMITED` — instead of a misleading `500` (repays known debt). Every
  `500` logs `reqId` + `route` + a stable `fingerprint`.
- **`migrations/0008_hardening_indexes.sql`**: `saved_articles(account_id, id)` +
  `publisher_follows(account_id, id)` — the `GET /saved-articles` /
  `/publisher-follows` keyset queries went from a PK-scan-with-filter to a clean
  index cond (`EXPLAIN`-proven, `docs/PERFORMANCE.md`). Also in
  `schema/reader.ts` so schema and migration agree.
- **N+1 removed** from `GET /publisher-follows` (`creditAggregateForPublishers`).
- **`docs/RUNBOOK.md`** (deploy, code-vs-schema rollback, run a migration, DB at
  90% connections, worker stuck, backup + restore-drill plan),
  **`docs/THREAT_MODEL.md`** (per-endpoint-group attack → control),
  **`docs/PERFORMANCE.md`** (the N+1 audit + every `EXPLAIN ANALYZE`).

Error tracking is the hardened pino logging, **not** a new dependency. Backups +
a tested restore are **documented in the runbook, not executed** — no live
deployment. See [SPRINT_15_REPORT.md](sprints/SPRINT_15_REPORT.md).

Before Sprint 15: **publisher-dashboard reads** (Sprint 14) — 6 GET
`/publishers/{id}/*` endpoints; `activity_events` + `credibility_score_history`
written by a recorder injected into the write services. See
[SPRINT_14_REPORT.md](sprints/SPRINT_14_REPORT.md).

**TrustStatus** precedence (2026-09-09): `notfound > disputed >
publisher_unverified > authentic_under_review > updated > authentic`; anchor
state and redaction are separate tracks. All six values reachable.
**Credibility** (2026-09-09): computed at read time in
`apps/api/src/services/trust.ts`; logged to `credibility_score_history` on
score-moving events (Sprint 14); the cached `publishers.credibility_score`
column is still never written.

**Biggest current gap:** **nothing has been pushed since Sprint 2 — CI and
`docker compose up` have never run.** That is now the single highest-value
action. After it, the remaining work is the real external integrations (see
below), not build-prompt phases.

Still mock / unbuilt, deliberately or blocked, after Sprint 15:

- **CI has never run**; nothing pushed since Sprint 2.
- **Backups + restore are documented, not executed** (`RUNBOOK.md`) — needs a
  deployment.
- **No error-tracking vendor** — structured logs + a `fingerprint` grouping
  key; alerting is the deploy platform's job.
- **Rate limiting is per-instance** — exact cross-instance limits need the Redis
  store (documented).
- **No real chain `AnchorProvider`** — the chain root of trust is a fake. The
  Merkle spec / proof format are frozen and third-party-verifiable; only chain
  submission is stubbed.
- **No real `ObjectStore`**, **no evidence-blob-read endpoint** — evidence blobs
  live in memory; "View File" is inert.
- **No real `SourceArchiver`** — `createFakeSourceArchiver` never touches the
  network. `THREAT_MODEL.md` names the SSRF guard the real one needs as the top
  item for that slice.
- **No admin re-queue for `anchor_failed`** — terminal since Sprint 4; manual
  SQL recovery in `RUNBOOK.md`.
- **The publisher-dashboard + reader frontend components are hardcoded** and not
  wired (`AnalyticsCards`, `CredibilityPanel`, `RecentActivity`,
  `PublisherProfileCard`, `ReviewsDisputes`, `SavedArticles.tsx`,
  `TrustedPublishers.tsx`, `RecentlyVerified.tsx`, `UserStats.tsx`) — the build
  prompt forbade restructuring them; revisit that constraint.
- **No real Clerk Organization** — `publishers.clerk_org_id` is a
  `local_org_<uuid>` placeholder; `publisher_members` is our own table.
- **`activity_events` covers only the `apps/api` write paths** — no `blockchain`
  event from the worker, no `redaction` event.
- **`GET /publishers/{id}/articles` is not redaction-suppressed**;
  **`changeSummary` not blanked on a redacted version**; **redaction
  irreversible**; **no un-verify**.
- **`ensureAccount` is first-writer-wins on `role`**;
  **`reviewerSchema` in the approval queue is identity-free**;
  **admin decision endpoints don't reject a no-op.**
- **No dispute frontend**; **no reviewer-facing write UI** (`ReviewerPortal.tsx`
  is a stub).
- **No backend search endpoint.**

## Sprint ledger

| Sprint | Objective | Status | Report |
|---|---|---|---|
| 0 | Discovery — domain model, screen map, open questions, stack proposal | Complete with carryover | [SPRINT_0_REPORT.md](sprints/SPRINT_0_REPORT.md) |
| 1 | Full DB schema, Zod contracts, generated openapi.json, seed script | Complete with carryover | [SPRINT_1_REPORT.md](sprints/SPRINT_1_REPORT.md) |
| 2 | apps/api skeleton: auth, error handling, logging, config, health, Docker Compose, CI, GET /me | Complete with carryover | [SPRINT_2_REPORT.md](sprints/SPRINT_2_REPORT.md) |
| 3 | Article vertical slice: backend CRUD, packages/anchoring, generated client — verified live | Complete with carryover | [SPRINT_3_REPORT.md](sprints/SPRINT_3_REPORT.md) |
| 4 | Anchoring slice: Merkle tree + proof + AnchorProvider, durable crash-safe worker, GET /versions/{id}/anchor | Complete with carryover | [SPRINT_4_REPORT.md](sprints/SPRINT_4_REPORT.md) |
| 5 | Evidence slice: multipart POST + public GET, ObjectStore + SourceArchiver seams (fakes), append-only | Complete with carryover | [SPRINT_5_REPORT.md](sprints/SPRINT_5_REPORT.md) |
| 6 | Review slice: GET/POST reviews + retract, approved-reviewer gate, structural COI, append-only retraction | Complete with carryover | [SPRINT_6_REPORT.md](sprints/SPRINT_6_REPORT.md) |
| 7 | Dispute slice: 5 endpoints, publisher-cannot-suppress, terminal lifecycle, append-only — backend + tests only | Complete with carryover | [SPRINT_7_REPORT.md](sprints/SPRINT_7_REPORT.md) |
| 8 | Composed GET /articles/{id}/verification + read-time credibility; VerificationResult on one call | Complete with carryover | [SPRINT_8_REPORT.md](sprints/SPRINT_8_REPORT.md) |
| 9 | Admin decision queues: publisher-verification + reviewer-approval, single `admin` authz action — backend + tests only | Complete with carryover | [SPRINT_9_REPORT.md](sprints/SPRINT_9_REPORT.md) |
| 10 | Account provisioning: POST /publishers + /reviewers/apply, lazy `accounts` materialization, RegisterForm wired | Complete with carryover | [SPRINT_10_REPORT.md](sprints/SPRINT_10_REPORT.md) |
| 11 | Version-verification: POST /versions/{id}/verify, append-only `version_verifications`, `verified` derived at read time | Complete with carryover | [SPRINT_11_REPORT.md](sprints/SPRINT_11_REPORT.md) |
| 12 | Redaction: GET/POST /versions/{id}/redaction, admin-only, append-only tombstone (0007 trigger), read-layer suppression | Complete with carryover | [SPRINT_12_REPORT.md](sprints/SPRINT_12_REPORT.md) |
| 13 | Reader features: POST /readers + six saved-article/publisher-follow endpoints, batched read-time trustStatus | Complete with carryover | [SPRINT_13_REPORT.md](sprints/SPRINT_13_REPORT.md) |
| 14 | Publisher-dashboard reads: 6 GET /publishers/{id}/* endpoints; activity_events + credibility_score_history now written | Complete with carryover | [SPRINT_14_REPORT.md](sprints/SPRINT_14_REPORT.md) |
| 15 | Hardening (Phase 5): rate limiting, error-envelope for framework 4xx, N+1/EXPLAIN audit + 0008 indexes, RUNBOOK + THREAT_MODEL + PERFORMANCE docs | Complete with carryover | [SPRINT_15_REPORT.md](sprints/SPRINT_15_REPORT.md) |

## Current domain model

Supersedes `docs/DOMAIN.md` where they disagree. **19 tables** — unchanged since
Sprint 11 added `version_verifications`. Sprint 15 added `0008` (two indexes, no
table). `activity_events` and `credibility_score_history` are written by the API
as of Sprint 14.

TrustStatus, credibility (the score), and `verified` are computed at read time.
Redaction is read-layer suppression. The cached `publishers.credibility_score`
column is unwritten.

```
Account ──has role──> reader | publisher | reviewer | admin

Publisher (1) ──has──> (N) PublisherMember ──> Account   [org membership + reviewer-COI join]
Publisher (1) ──publishes──> (N) Article
Publisher (1) ──has──> (N) ActivityEvent           [written Sprint 14]
Publisher (1) ──has──> (N) CredibilityScoreHistory [written Sprint 14, deduped]

Article   (1) ──has──> (N) ArticleVersion   [append-only once non-draft, hash-chained]
ArticleVersion (1) ──has──> (N) Evidence
ArticleVersion (1) ──has──> (1) AnchorRecord
ArticleVersion (1) ──has──> (0..1) Redaction       [append-only tombstone; admin-only;
                                                     blanks content at the read layer]
ArticleVersion (1) ──has──> (N) Review
ArticleVersion (1) ──has──> (0..1) VersionVerification  [append-only; presence = "verified"]
ArticleVersion (1) ──has──> (N) Dispute
Dispute        (1) ──has──> (N) DisputeEvent

Reviewer  (1) ──is a──> Account
Reviewer  (1) ──writes──> (N) Review | (N) Dispute | (N) VersionVerification

Account(reader) ──saves───> (N) SavedArticle ──> Article
Account(reader) ──follows─> (N) PublisherFollow ──> Publisher

AnchorBatch (1) ──has──> (N) AnchorRecord
```

## Implemented endpoints

`packages/shared/openapi.json` — **35 paths / 44 operations; all 44 implemented**,
verified against a real database. `GET /healthz` / `GET /readyz` also exist but
are intentionally not in `openapi.json`. Full method/path/auth/sprint table: see
Sprint 14's PROJECT_STATE (unchanged in Sprint 15). Rate limiting now applies to
all of them (health checks exempt; mutating methods get the tighter budget).

## Decisions

Append-only. Load-bearing entries kept; sprint reports carry the rest.

- 2026-07-08 — Railway deploy target (Fly.io fallback). **Confirmed 2026-08-26.**
- 2026-07-08 — Clerk for auth. **Confirmed 2026-08-26.**
- 2026-08-26 — Anchor state always shows an explicit badge, never optimistic
  "verified." **Sprint 4.**
- 2026-08-26 — Dispute is a separate entity; a publisher may respond but never
  resolve/withdraw/hide. **Sprint 7.**
- 2026-08-26 — Credibility uses exactly the 3 factors the frontend shows;
  revisit as a versioned formula change.
- 2026-08-26 — Reviewer COI is structural (`publisher_members`). Shared by
  `review:create` / `dispute:file` / `version:verify`.
- 2026-08-26 — Redaction tombstones are fully public; the legal `reason` is not
  in the public schema. **Enforced Sprint 12.**
- 2026-08-26 — Publisher verification unverified → pending → verified (+
  rejected) by an `admin` account; one `admin` role, both queues.
- 2026-08-26 — Reader-facing trust status has 6 values.
- 2026-08-26 — Reviews/disputes attributed by pseudonym; `accounts.fullName`
  never exposed. Extended Sprint 11.
- 2026-08-26 — `/simple-login` and `/reader-portal` are dead. **Not yet
  deleted.**
- 2026-08-26 — Schema entity names frozen at the Sprint 1 stop point.
- 2026-08-26 — Session auth is a Clerk JWT `Authorization: Bearer`, verified
  with `@clerk/backend`.
- 2026-08-26 — The Fastify instance takes an injectable `SessionVerifier`; the
  database is never substituted (real Postgres, real migrations).
- 2026-08-27 — `packages/anchoring` canonicalization/hashing spec frozen.
- 2026-09-08 — Merkle anchoring spec frozen; anchoring runs in a separate
  `apps/worker`; a failing batch retries with backoff then goes terminal
  `anchor_failed`.
- 2026-09-09 — Evidence / review / dispute / saved-article / follow lists
  keyset-paginate on the row `id`.
- 2026-09-09 — Dispute slice: `dispute:file` shares the `review:create` gate;
  `respond` = membership; `withdraw` = the filer alone; `resolve` = the filer or
  a `role === "admin"` account.
- 2026-09-09 — `GET /articles/{id}/verification`: TrustStatus derived at read
  time; anchor state not an input; 404 body is `{ trustStatus: "notfound" }`.
- 2026-09-09 — Credibility computed at read time; cached column not written
  *(history table written as of Sprint 14; cached column still not)*.
- 2026-09-09 — Admin queues: a single `{ type: "admin" }` action; decisions
  record author + timestamp, permissive on current state, `404` only unknown id.
- 2026-09-10 — Account provisioning (Sprint 10): `POST /publishers` /
  `/reviewers/apply` behind `requireAuth`; lazy `ensureAccount` keyed by the
  verified `clerkUserId`, first-writer-wins; placeholder `clerk_org_id`.
- 2026-09-10 — Version verification (Sprint 11): `version:verify` = the
  `review:create` predicate; append-only `version_verifications` row, never an
  `UPDATE` of `review_status`; no anchor precondition; `verified` derived at
  read time; no un-verify.
- 2026-09-10 — Redaction (Sprint 12): `{ type: "admin" }` gate; read-layer
  suppression only; `tombstoneHash` = `contentHash`; append-only (`0007`),
  one-per-version → `409`; the legal `reason` returned by no endpoint;
  `articleVersionSchema` content fields nullable + a `redaction` field.
- 2026-09-10 — Reader features (Sprint 13): `POST /readers` mirrors Sprint 10;
  six per-reader endpoints behind `requireActor`; saved-list `trustStatus`
  batched over the page; re-save/re-follow → `409`; `POST /saved-articles`
  requires a published version.
- 2026-09-10 — Publisher dashboard (Sprint 14): the three authed reads require
  only `requireActor` (any account), not membership; the other three are
  public; `404` an unknown publisher. `credibility_score_history` +
  `activity_events` written by a `PublisherEventRecorder`; a credibility point
  only when the recomputed score changed; the cached column stays unwritten.
  `GET /publishers/{id}/reviews` merges reviews + disputes with a composite
  `<createdAt>~<kind>~<id>` cursor. Tier ladder `≥90 Outstanding / ≥75
  Excellent / ≥60 Good / ≥40 Fair / else Poor`.
- 2026-09-10 — Hardening (Sprint 15): in-memory `@fastify/rate-limit` (Redis
  swap documented), per-IP, tighter on mutating methods, health exempt, `429` →
  `{ code: "RATE_LIMITED" }`. `buildApp` is `async` (rate-limit plugin ordering).
  Error tracking is structured pino logging with a `fingerprint`, **not** a
  vendor SDK. Framework `4xx` (413/415/429) map onto the standard envelope.
  `0008` adds `saved_articles(account_id,id)` + `publisher_follows(account_id,id)`.
  Backups + restore documented in `RUNBOOK.md`, not executed. Confirmed with the
  user.

## Open questions

- *(none ranked as blocking)*.

## Known debt and deviations

- **Docker is still never available in this environment**, across fifteen
  sprints. `embedded-postgres` binaries are execution-blocked from
  `%LOCALAPPDATA%\Temp` on this host; copied to a non-temp path (`D:\…`) they
  run. Everything that mattered (all 9 migrations, seed, 237 workspace tests,
  the EXPLAIN audit) was verified against a real PostgreSQL 16.14 driven from
  `initdb` / `pg_ctl` on a non-temp path, torn down afterward. What's left:
  confirm CI goes green on GitHub's runners, and confirm `docker compose up`.
- **CI has never run.** Nothing pushed since Sprint 2. **Sprint 15 is awaiting
  commit.**
- **`@fastify/rate-limit` does not limit under vitest's module runner** (works
  in real Node) — the rate-limit test is a spawned plain-Node subprocess
  (`test/fixtures/rate-limit-smoke.cjs`). Its config is inlined there *and* in
  `src/plugins/rateLimit.ts` (the fixture is CJS and can't import the TS);
  low drift risk, comment links them.
- **`buildApp` is async** — paid to a Fastify v5 + rate-limit v10 registration
  ordering quirk; both call sites (`server.ts`, `testApp.ts`) updated.
- **Backups / restore not executed** — plan only, in `RUNBOOK.md`.
- **`CREATE INDEX CONCURRENTLY` not used for 0008** — small indexes; the runbook
  covers the concurrent path.
- **Drizzle anchoring-index snapshot drift** — `schema/anchoring.ts` still lacks
  `anchor_records_status_idx` / `anchor_batches_status_idx` (0005 hand-written).
  The `0007` snapshot `id`/`prevId` was fixed in Sprint 15 so `drizzle-kit
  generate` chains again; the anchoring index gap remains, repay when anchoring
  is next touched.
- **`articleVersionSchema` content fields are `string | null` for every
  consumer** (Sprint 12); non-redacted data never returns `null`.
- **`GET /publishers/{id}/reviews` re-queries both tables per page** from the
  cursor timestamp; fine at year-one volume.
- **`GET /publishers/{id}/articles` is not redaction-suppressed**;
  **`changeSummary` not blanked**; **redaction irreversible**; **no un-verify**.
- **`article_versions.review_status = 'verified'` is dead as an API outcome**
  (Sprint 11); honoured by the read overlay if present.
- **`activity_events` covers only the `apps/api` write paths.**
- **The cached `publishers.credibility_score` / `transparency_level` columns
  stay unwritten.**
- **No verifier identity in the composed verification read.**
- **`RegisterForm.tsx` wired for all three roles but not integration-tested** —
  needs a live Clerk project.
- **`registryMember` / `versionMatch` trustSummary facts are `true` on every
  200.**
- **Version-scoped `evidence` / `reviews` in the verification response use
  `LIMIT 1000`.**
- **`Actor.role` is typed `string`, not the `account_role` enum.**
- **`dispute:file`, `review:create`, `version:verify` share a switch `case`.**
- **Dispute withdrawal is filer-only, even for an admin.**
- **Evidence hashes are not anchored.**
- **No real `ObjectStore` / evidence-blob-read endpoint / real `SourceArchiver`
  / real `AnchorProvider` / admin re-queue for `anchor_failed`.**
- **`articles.repository.ts` cursor pagination keys on a millisecond-truncated
  `created_at`** (`listPublishedVersions`, `listForPublisher`).
- **`apps/web` has no `tsconfig.json`** (Figma Make export); `vite build` is its
  only standing check.
- **`apps/worker` duplicates `apps/api`'s `startTestDb` + pool setup** (~30
  lines).
- **`docs/ANCHORING.md`'s leaf-order rule is enforced by `ORDER BY`, not a
  constraint.**
- **The `TEST_DATABASE_URL` escape hatch is single-file-parallelism only.**
- **`/simple-login` and `/reader-portal` still exist in `apps/web`**, dead since
  Sprint 1.

## How to run

Confirmed working this sprint (against a real PostgreSQL 16.14 via
`initdb`/`pg_ctl` on a non-temp path — Docker unavailable, `embedded-postgres`
binaries blocked from `%TEMP%`; `apps/web` via `vite build`):

```
pnpm install                                   # workspace install
pnpm typecheck                                 # apps/api + apps/worker + packages/shared + packages/anchoring — 0 errors
pnpm lint                                      # same four — 0 errors/warnings
pnpm --filter @sourceit/shared db:migrate      # applies all 9 migrations (0000–0008) for real — verified
pnpm --filter @sourceit/shared seed            # verified (2 articles, 2 saved, 2 follows, 1 redaction, 6 credibility points)
pnpm --filter @sourceit/anchoring test         # 33/33 — verified
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/api  exec vitest run --no-file-parallelism   # 197/197 — verified (194 prior + 3 hardening)
TEST_DATABASE_URL=<url> pnpm --filter @sourceit/worker exec vitest run                        # 7/7 — verified
pnpm --filter @sourceit/shared openapi:generate && pnpm --filter @sourceit/shared client:generate  # regenerated, not hand-edited
pnpm dev                                        # runs apps/api + apps/worker in parallel; both need ../../.env
pnpm --filter @sourceit/web dev                # needs apps/web/.env.local (VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL)
pnpm --filter @sourceit/web build              # 2204 modules — verified
```

`.env` for `pnpm dev`: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `CORS_ORIGIN`, and optionally `RATE_LIMIT_MAX` /
`RATE_LIMIT_WRITE_MAX` / `RATE_LIMIT_WINDOW_MS` (api); the worker reads the same
file and takes optional `ANCHOR_TICK_MS` / `ANCHOR_MAX_BATCH` /
`ANCHOR_MAX_ATTEMPTS` / `FAKE_ANCHOR_CONFIRMATIONS`. `apps/api` also accepts
injected `objectStore` / `sourceArchiver` in `buildApp`.

Operational docs: `docs/RUNBOOK.md`, `docs/THREAT_MODEL.md`,
`docs/PERFORMANCE.md`.

Still not possible here: `docker compose up`, or Testcontainers (both need
Docker). On Windows, prefer a Postgres install outside `%LOCALAPPDATA%\Temp` —
binaries under the temp tree are execution-blocked on this host. A killed
launcher can leave an orphaned `postgres.exe` on the test port — check with
`Get-NetTCPConnection -LocalPort <port>`.
