# Sprint 5 — Evidence Slice

**Dates:** 2026-09-09 → 2026-09-09  ·  **Status:** Complete with carryover

## 1. Objective

Make a version's supporting evidence real: a publisher can attach files (and
archived snapshots of external source URLs) to a version while it is still a
draft, each file's bytes are hashed and stored content-addressed, and anyone —
signed in or not — can list a published version's evidence. This is the first of
the three inputs `GET /articles/{id}/verification` needs (Evidence, Review,
Dispute) and it lets the verification page's Supporting Evidence panel show real
data instead of a mock array. The slice follows the Phase 3 article template:
full create + list, authorization with negative tests, integration tests for
every failure mode, frontend read path wired and its mock deleted from the code
path. There are deliberately no update/delete endpoints — evidence is
append-only by a build-prompt invariant and a database trigger.

The objective was met. Nothing in it was blocked. Three design points were put
to the user before implementation (multipart upload transport, a fake-only
source archiver, and wiring only the read path in the frontend); all three were
confirmed and built as confirmed.

## 2. Changes from Previous Sprint

- **`POST /versions/{versionId}/evidence` is `multipart/form-data`, not
  `application/json`.** The Sprint 1 contract registered it as a JSON body with
  a comment that "file bytes travel out-of-band (multipart)"; that gap is now
  closed the way Sprint 4 closed `anchorRecordSchema`'s — amended on
  implementation, documented inline. `uploadEvidenceRequestSchema` is now the
  set of non-file form fields; a new `UploadEvidenceMultipart` OpenAPI schema
  adds the binary `file` part. The POST also gained `400` and `404` responses
  and the GET gained `404`, all of which the Sprint 1 path had omitted.
- **`@sourceit/api` depends on `@fastify/multipart` (`^9.4.0`)** — the one
  endpoint in the system that isn't JSON. Writing a multipart parser by hand
  against `busboy` would have been ~100 lines of stream bookkeeping for no gain;
  the plugin is the Fastify-native choice and is registered once in `app.ts`
  next to `@fastify/cors`.
- **No migration.** The `evidence` table and its `evidence_append_only` trigger
  have existed since Sprint 1 (`0000_initial_schema.sql`,
  `0001_append_only_triggers.sql`) and needed no change. The Sprint 4 carryover
  list is otherwise untouched and still carried: no real `AnchorProvider`, no
  admin re-queue for `anchor_failed`, `GET /articles/{id}/verification` still
  unbuilt, `RegisterForm` still unwired, no backend search.
- **Docker is still unavailable in this environment** (fifth sprint running).
  Verification again used a scratch `embedded-postgres` instance outside the
  repo, torn down afterward.

## 3. Key Enhancements

- A member of the publisher that owns a **draft** version can attach evidence to
  it via `POST /versions/{versionId}/evidence` (multipart): `fileType`, `tag`
  (`cover_image` / `media` / `evidence` / `source`), `filename`, an optional
  `caption`, and either a `file` part or — for `tag=source` — a `sourceUrl`. The
  server hashes the bytes with SHA-256, stores them content-addressed
  (`evidence/<hash>`), and writes the evidence row. Once the version leaves
  draft the evidence set is frozen with it.
- For `tag=source`, the external URL is fetched and snapshotted at attach time
  and the row is marked `isArchivedSnapshot = true`, so a later link rot does
  not silently degrade what the version was backed by. Only the deterministic
  in-memory archiver ships this sprint (see §8).
- Anyone, signed in or not, can call `GET /versions/{versionId}/evidence` and
  get that version's evidence, cursor-paginated. A draft version's evidence
  `404`s — its existence is not disclosed to non-members, matching how
  `GET /articles/{id}/versions/{id}` already treats a draft.
- The verification page's **Supporting Evidence** panel
  (`EvidenceSection.tsx`) now renders the current version's real evidence —
  filename, type icon, tag, caption, and an "Archived snapshot" badge — falling
  back to the mock rows only when no `articleId` is in the URL, the same
  null→mock pattern `VersionHistory` and `IntegrityRecord` use.

## 4. Architecture Changes

- **New injectable boundaries in `apps/api`, both defaulting to a fake:**
  - `ObjectStore` (`src/storage/objectStore.ts`) — `put(key, bytes, contentType)`
    / `get(key)`, content-addressed, idempotent on key. `createInMemoryObjectStore()`
    is the only implementation this sprint; a real S3/R2/volume store plugs in
    at `buildApp({ objectStore })` with no service or route change. This is the
    same call Sprint 4 made with `AnchorProvider` (fake only, by decision).
  - `SourceArchiver` (`src/storage/sourceArchiver.ts`) — `archive(url)` →
    `{ bytes, contentType }`. `createFakeSourceArchiver()` is deterministic
    (`archived-snapshot:<url>`). A real guarded server-side fetch (SSRF
    allow/deny-listing, redirect and body caps, timeouts) belongs with the
    Phase 5 threat pass.
  - Both are `app.decorate`-d and passed to the evidence service, and both are
    overridable through the extended `BuildAppOptions`, exactly like
    `verifySession`.
- **New in `apps/api`:** `routes/evidence.route.ts` → `services/evidence.service.ts`
  → `repositories/evidence.repository.ts`, following the Phase 3 template. The
  route parses the multipart stream (draining every file part so the request
  can't stall), validates the fields with `uploadEvidenceRequestSchema`, and
  hands the buffered file to the service.
- **`@fastify/multipart` registered globally in `app.ts`** with a 25 MB / one
  file / 16 field limit — next to `@fastify/cors`, since it is cross-cutting
  request handling rather than one route's concern.
- **New authorization action** `evidence:attach` in `src/auth/can.ts` —
  resolves to publisher membership, the same check as `article:writeDraft`.
- **New error class** `ValidationError` (400, code `VALIDATION_ERROR`) in
  `src/errors.ts` — for a request that parsed structurally but is semantically
  invalid (a non-`source` tag with no file part; `tag=source` with no
  `sourceUrl`). Shares its code with the Zod path in `errorHandler.ts` so the
  frontend switches on one code for all bad input.
- **No new dependency edge between packages.** The evidence service reuses
  `@sourceit/anchoring`'s `sha256Hex` (already a dependency of `apps/api`).

## 5. Database Changes

**None.** `migrations/` is unchanged. The `evidence` table
(`article_version_id` FK, `file_type` / `tag` enums, `filename`, `caption`,
`content_hash`, `storage_key`, `source_url`, `is_archived_snapshot`,
`created_at`), its `evidence_article_version_id_idx` index, and the
`evidence_append_only` `BEFORE UPDATE OR DELETE` trigger were all created in
Sprint 1 and were built to fit this slice. No column, index, constraint, or
trigger was added, altered, or dropped. All six existing migrations were applied
to a real Postgres by every integration-test run this sprint (each run migrates
from empty).

## 6. New Components

**Endpoints** (of the 33 in `openapi.json`, 12 now implemented):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /versions/{versionId}/evidence | public | The version's evidence, cursor-paginated. 404 if the version is unknown or still a draft. |
| POST | /versions/{versionId}/evidence | Clerk bearer token | Attach one evidence item (multipart) to a draft version. 400 on a missing file part / bad fields; 404 if the version is unknown or the caller can't write its draft; 409 if the version is no longer a draft. |

Layering: `routes/evidence.route.ts` → `services/evidence.service.ts` →
`repositories/evidence.repository.ts` → Postgres, plus `app.objectStore` and
`app.sourceArchiver`.

**`apps/api` new modules:** `storage/objectStore.ts`, `storage/sourceArchiver.ts`,
`repositories/evidence.repository.ts` (`findVersionWithPublisher`,
`createEvidence`, `listEvidence`), `services/evidence.service.ts`
(`listEvidence`, `attachEvidence`), `routes/evidence.route.ts`.

**Contract (`packages/shared`):** `UploadEvidenceMultipart` OpenAPI schema;
`uploadEvidenceRequestSchema` re-documented as the multipart field set;
regenerated `openapi.json` and `src/client/schema.d.ts` (not hand-edited).

**Frontend** wired to real data, no visual/structural change: `EvidenceSection`
gains an optional `evidence` prop (null → mock); `VerificationResult` fetches
`GET /versions/{currentVersionId}/evidence` alongside the anchor call and passes
it down.

## 7. Sprint Test Results

**Totals: 78 tests, 78 passing, 0 failing, 0 skipped** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/worker` 7, `@sourceit/api` 38 — up from 25
by the 13 new evidence tests). No test was weakened to pass. One real bug was
found and fixed *because* a test failed (see below).

**`apps/api` — `test/evidence.integration.test.ts`: 13/13** (real Postgres via
`embedded-postgres`, `--no-file-parallelism`):

- **401** — POST with no `Authorization` header (`code: UNAUTHENTICATED`).
- **404** — POST to an unknown version id (`code: NOT_FOUND`).
- **404, not 403** — a member of publisher B POSTs to publisher A's draft
  version; the draft's existence is not leaked. This is the negative
  authorization test and the cross-tenant leakage test for this slice.
- **409** — POST to a version that has left draft (`code: CONFLICT`).
- **400** — POST with a required field missing (`code: VALIDATION_ERROR`, via
  the Zod path).
- **400** — POST with a non-`source` tag and no `file` part
  (`details[0].field === "file"`).
- **400** — POST with `tag=source` and no `sourceUrl`
  (`details[0].field === "sourceUrl"`).
- **201** — an uploaded file: `contentHash` equals `sha256Hex` of the exact
  bytes sent, `isArchivedSnapshot` false, `sourceUrl` null, metadata echoed.
- **201** — `tag=source`: no file part; `isArchivedSnapshot` true, `sourceUrl`
  echoed, `contentHash` equals `sha256Hex("archived-snapshot:<url>")` (the
  deterministic fake archiver).
- **list + pagination** — three items attached to a draft, the draft then
  submitted; `GET ?limit=2` returns 2 with a string `nextCursor`, the follow-up
  page returns the last 1 with `nextCursor: null`, and the union of the two
  pages is exactly the three rows with no overlap.
- **404** — public `GET` of a draft version's evidence.
- **404** — public `GET` of an unknown version's evidence.
- **append-only** — a direct `UPDATE` against the `evidence` table rejects with
  `/append-only/` (the `evidence_append_only` trigger).

**Invariant coverage (build prompt Section 1):**
- *Evidence binds to a version, not an asset* — the endpoint is
  `/versions/{id}/evidence`; the row's `article_version_id` is a NOT NULL FK;
  the 409 test proves the binding is fixed once the version is submitted.
- *Evidence files are hashed … like content* — the "uploaded file" and
  "tag=source" 201 tests assert `contentHash === sha256Hex(bytes)` and the
  service stores under `evidence/<hash>`. **Note:** evidence hashes are computed
  and stored but are **not yet fed into the anchoring Merkle tree** — the worker
  still batches only version content hashes. "Hashed" is done; "anchored" is
  not. See §8.
- *Append-only* — the direct-`UPDATE`-rejected test.
- *Reads are public and unauthenticated* — `GET` has no `preHandler`; the two
  draft/unknown `404` tests prove a non-public version discloses nothing.
- *Verification must not silently degrade when a third-party URL rots* — the
  `tag=source` path fetches and snapshots at attach time and sets
  `isArchivedSnapshot`; proven by the 201 source test. Only the fake archiver
  ships (§8).

**Existing suites, unchanged and still green:** `articles.integration.test.ts`
18/18, `anchor.integration.test.ts` 4/4, `me.integration.test.ts` 3/3;
`@sourceit/worker` 7/7; `@sourceit/anchoring` 33/33.

**Bug found by a failing test:** the first cut of `listEvidence` keyset-paginated
on `created_at`, with the cursor being `row.createdAt.toISOString()`. Postgres
stores `timestamptz` to microseconds; a JS `Date` and an ISO string carry only
milliseconds, so `WHERE created_at > '<...>.123Z'` re-serves a row whose true
timestamp is `.123456` — and three same-request appends do land in one
millisecond, so the pagination test caught a row appearing on two pages.
`listEvidence` now keyset-paginates on `id` (a total, exactly-round-tripping
order); order within a version's evidence is a flat list and not otherwise
meaningful. **The same latent pattern exists in
`apps/api/src/repositories/articles.repository.ts` (`listPublishedVersions`,
`listForPublisher`) and is pre-existing** — left as-is per "surgical changes",
recorded here and in `PROJECT_STATE.md` debt.

**`pnpm typecheck`, `pnpm lint`: 0 errors** across `apps/api`, `apps/worker`,
`packages/shared`, `packages/anchoring`. No `any`, no `@ts-expect-error`, no
skipped tests. **`apps/web`:** `vite build` succeeds (2204 modules, unchanged
count). It still has no `tsconfig.json` (pre-existing); an ad-hoc `tsc` of the
two touched files surfaces only the known environmental gaps (`@types/react` not
resolvable from `apps/web`), none from the changes.

**Not run in CI.** Unchanged carryover — nothing has been pushed since Sprint 2
added the workflow. Docker (`docker compose up`, Testcontainers) still
unavailable here; `embedded-postgres` remains the substitute.

## 8. Outcome

**Done and verified against a real Postgres:** `POST` and `GET`
`/versions/{versionId}/evidence` end to end — multipart upload, SHA-256 hashing
of the bytes, content-addressed storage through an `ObjectStore` seam,
`tag=source` archival through a `SourceArchiver` seam, draft-only attachment,
public draft-safe listing with cursor pagination, authorization with a
not-403-but-404 negative test, and the append-only trigger proven from a test.
The frontend Supporting Evidence panel is wired to the real list. 78/78 tests
green.

**Not done, deliberately:**
- **Evidence hashes are not anchored.** Files are hashed and stored, but the
  anchoring worker still builds its Merkle tree from version content hashes
  only. Feeding evidence hashes into the tree (or a per-version evidence
  manifest hash into the version content) is a real piece of the "evidence
  files are hashed **and anchored** like content" invariant and is not in this
  slice. Repay when the anchoring model is next opened.
- **No real object store.** `createInMemoryObjectStore` only — blobs live in the
  API process and do not survive a restart. A real store is a `buildApp` option
  away. There is also **no endpoint to read a stored blob back**: the
  verification page's "View File" button is still inert, because serving file
  content (range requests, content-type, auth posture for draft evidence) is
  its own slice and `openapi.json` has no such path.
- **No real source archiver.** `createFakeSourceArchiver` only — it does not
  touch the network. A guarded server-side fetch is deferred to the Phase 5
  threat pass, as confirmed with the user.
- **The frontend write path is not wired.** `MediaEvidenceUpload.tsx` still
  keeps files in local state and sends nothing. Wiring it needs
  `PublishArticlePanel` to become a two-phase flow (create the draft, then
  upload each file, then submit), which bumps against the build prompt's "may
  not restructure components" — deferred, as confirmed with the user. Its mock
  `UploadedFile` state therefore still exists; the read-path mock
  (`EvidenceSection`'s array) is retained only as the no-`articleId` fallback,
  matching the Sprint 3/4 pattern.

**Known debt incurred:**
- `apps/api/src/repositories/articles.repository.ts` paginates on a
  millisecond-truncated `created_at` ISO cursor and can re-serve or skip a row
  that shares a millisecond with the page boundary. Pre-existing; evidence
  dodged it by keying on `id`. Repay by moving the article cursors to an
  `id`-keyset (or a `(created_at, id)` composite cursor that carries full
  precision) when those endpoints are next touched.
- A `POST` with a body but no `Content-Type` at all yields Fastify's own `415`,
  which the app error handler turns into a `500` (it only special-cases
  `AppError`, `ZodError`, and Fastify schema `validation`). No realistic client
  hits this; repay by teaching `errorHandler.ts` to pass through a
  `FastifyError` with a 4xx `statusCode`.
- `@fastify/multipart`'s `fileSize` limit throws a `413` from `toBuffer()` that
  is not mapped to the error envelope. Same repayment as above.

**Blocked on:** nothing.

**Next sprint should do first:** the Review slice (reviewer annotations —
`confirmation` / `clarification` / `correction_note` — bound to a version,
append-only with a `ReviewRetraction` row rather than an edit, structural
conflict-of-interest enforcement via `publisher_members`). It is the second of
the three inputs `GET /articles/{id}/verification` needs. The Dispute slice is
the third. Alternatively, account provisioning (`POST /publishers`,
`POST /reviewers/apply`) so `RegisterForm` works. Either way: push to GitHub and
confirm CI actually goes green — it still never has.
