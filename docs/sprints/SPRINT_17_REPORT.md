# Sprint 17 — Real ObjectStore + evidence file endpoint

**Dates:** 2026-09-10 → 2026-09-10  ·  **Status:** Complete with carryover

## 1. Objective

The second remaining fake from the build prompt's "Third-party systems in
scope": object storage for evidence files. Evidence has been hashed and
attached since Sprint 5, but the bytes lived only in an in-memory map with no
way to read them back — "View File" on the verification page has been inert
since it was built. This sprint adds a real S3-compatible `ObjectStore` and the
endpoint that was never built at all (not just unimplemented): a public,
signed-URL redirect to the file, plus wiring the frontend button that has sat
disconnected since the component was written.

One point was confirmed with the user before implementation: the bucket stays
**private**, and a new `GET /versions/{id}/evidence/{evidenceId}/file` mints a
short-lived presigned URL on every call and redirects to it — rejecting the
alternative of a public-read bucket with a stable URL baked into the evidence
list, to keep the bucket ACL conventional and avoid a permanently-public link
per evidence item. Everything else (S3-compatible-generic client, storage
backend selection by env) followed from the existing `AnchorProvider` /
`SourceArchiver` seam pattern already in this codebase.

## 2. Changes from Previous Sprint

- **`ObjectStore` gained a third method: `getSignedUrl(key)`.** The in-memory
  fake returns a deterministic, obviously-non-functional
  `memory://unconfigured-object-store/<key>` placeholder — greppable, and
  fails loudly rather than looking like a working link.
- **New `apps/api/src/storage/s3ObjectStore.ts`** — `createS3ObjectStore(config,
  client?)`, any S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2,
  MinIO) via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. New
  dependencies of `apps/api`.
- **`apps/api/src/env.ts`** — `OBJECT_STORE_BUCKET` / `_REGION` /
  `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_ENDPOINT` / `_FORCE_PATH_STYLE` /
  `_SIGNED_URL_TTL_SECONDS`, all optional; a `superRefine` requires region + the
  two credential vars together with the bucket.
- **`app.ts`** — the default `ObjectStore` is now env-selected (real when
  `OBJECT_STORE_BUCKET` is set, else the fake), mirroring how `worker.ts`
  already picks the chain vs. fake `AnchorProvider`. An explicit
  `options.objectStore` (tests) still wins.
- **`evidence.repository.ts` gained `findEvidenceById`**; **`evidence.service.ts`
  gained `getFileUrl(versionId, evidenceId)`**; **`evidence.route.ts` gained
  `GET /versions/{versionId}/evidence/{evidenceId}/file`** (public, 302 to the
  signed URL, 404 for an unknown/draft version or an evidence id that doesn't
  belong to it).
- **`openapi/paths/evidence.ts`** registers the new path; `openapi.json` and the
  generated client regenerated.
- **Frontend**: `apps/web/src/app/lib/apiClient.ts` exports `API_BASE_URL`
  (previously module-private). `EvidenceSection.tsx`'s "View File" button now
  opens `${API_BASE_URL}/versions/{articleVersionId}/evidence/{id}/file` in a
  new tab for real evidence rows; mock rows keep the button disabled, unchanged
  from today. No markup restructuring — one prop added to the existing
  `<Button>`.
- **`docs/RUNBOOK.md`** — an "Object storage" section (bucket setup, sanity
  check, signed-URL lifetime, no lifecycle/expiry policy). **`docs/THREAT_MODEL.md`**
  — the evidence section covers the new endpoint; residual-risk list updated
  (the `AnchorProvider` and `ObjectStore` items from Sprint 15 are resolved,
  replaced with their real follow-on risks — the chain signer, the storage
  credential scope).
- **Carried over, still carried:** no real `SourceArchiver` (the SSRF guard is
  still the single most important open item per the threat model); no admin
  re-queue for `anchor_failed`; frontend components other than this one button
  remain hardcoded; no backend search; the Drizzle anchoring-index snapshot
  drift; `articles.repository.ts`'s millisecond cursor; the chain provider's
  live-testnet run still pending (Sprint 16, unrelated to this sprint).

## 3. Key Enhancements

- **`GET /versions/{versionId}/evidence/{evidenceId}/file`** (public) — looks up
  the evidence row, confirms it belongs to the given (non-draft) version, and
  `302`s to a signed URL from the configured object store. A fresh link is
  minted on every call; nothing is cached or reused.
- **Evidence bytes now actually persist** when a real bucket is configured —
  `put` is idempotent on the content-addressed key (a `HeadObject` check skips
  a redundant upload of identical bytes), `get` is available for a future
  server-side read (not yet used by any endpoint, but complete and tested).
- **"View File" works.** The one piece of `EvidenceSection.tsx` that had been
  inert since it was written now opens the real file in a new tab, for both
  freshly attached evidence and anything already in the (real) store.
- **Dev / CI need no configuration** — unset `OBJECT_STORE_BUCKET`, everything
  behaves as before (evidence attaches and lists fine; "View File" just has
  nothing real to redirect to).

## 4. Architecture Changes

- **`storage/s3ObjectStore.ts` takes an injectable `S3Client`** — `getSignedUrl`
  signs locally (no network call), so a real `S3Client` with dummy credentials
  is enough to test it directly; `put` / `get` call `client.send`, which tests
  stub. The same pattern as the chain provider's `ChainOps` seam (Sprint 16),
  applied to the AWS SDK's own command objects instead of a hand-rolled
  interface, since the SDK's `send(command)` shape is already a clean seam.
- **No new package, no schema change, no new background process.** The evidence
  table, its append-only trigger, and the upload path are untouched — this
  slice is a read path plus a storage backend swap.

## 5. Database Changes

**None.** `evidence.storage_key` (content-addressed, set since Sprint 5) is the
object key used unchanged; no migration.

## 6. New Components

**Endpoint** (of 44 prior + this one — see `openapi.json`):

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /versions/{versionId}/evidence/{evidenceId}/file | public | 302 to a short-lived signed URL for the file. 404 unknown/draft version or evidence not on it. |

Layering: `routes/evidence.route.ts` → `services/evidence.service.ts`
(`getFileUrl`) → `repositories/evidence.repository.ts` (`findEvidenceById`) +
`storage/objectStore.ts` (`getSignedUrl`).

**`apps/api` new modules:** `storage/s3ObjectStore.ts`.
**`apps/api` changed:** `storage/objectStore.ts` (`getSignedUrl` on the
interface + the fake), `env.ts`, `app.ts` (store selection),
`repositories/evidence.repository.ts`, `services/evidence.service.ts`,
`routes/evidence.route.ts`.

**Contract (`packages/shared`):** `openapi/paths/evidence.ts` — the new path
(`302` / `404`); `openapi.json` + `src/client/schema.d.ts` regenerated, not
hand-edited. No Zod schema change — a redirect has no response body.

**Frontend:** `apiClient.ts` exports `API_BASE_URL`; `EvidenceSection.tsx`'s
"View File" button wired for real evidence rows.

## 7. Sprint Test Results

**Totals: 259 tests passing, 1 skipped, 0 failing** across the workspace
(`@sourceit/anchoring` 33, `@sourceit/anchoring-contract` 3, `@sourceit/worker`
15 passing + 1 skipped (Sprint 16's env-gated live chain test, unrelated to
this sprint), `@sourceit/api` 208 — up from 197 by 11: 6 new
`s3ObjectStore.unit.test.ts` + 5 new file-endpoint tests appended to
`evidence.integration.test.ts`). No test was weakened or deleted.
`pnpm typecheck` and `pnpm lint`: 0 errors / 0 warnings across all five
packages. No `any`, no `@ts-expect-error`. `apps/web`: `vite build` succeeds
(2204 modules, unchanged — confirms the `EvidenceSection` wiring didn't break
anything).

**`apps/api` — `test/s3ObjectStore.unit.test.ts`: 6/6.** Unlike the chain
provider, **this backend is fully verified here, including the network-shaped
part**: `getSignedUrl` performs AWS SigV4 signing locally, so a real `S3Client`
constructed with dummy credentials and a fake endpoint produces a real,
inspectable signed URL with no network call —
- signs a URL embedding the configured bucket and key, with a valid
  `X-Amz-Signature` and the configured `X-Amz-Expires`;
- a custom `signedUrlExpirySeconds` is honoured;
- `put` **skips the upload** when a `HeadObject` check finds the key already
  exists (idempotent on the content-addressed key) — asserted via a stubbed
  `client.send`;
- `put` **uploads** (`PutObjectCommand` with the right `Bucket`/`Key`/`ContentType`)
  when the key is new;
- `get` returns `{ bytes, contentType }` for an existing key and `null` for a
  `NoSuchKey`.

**`apps/api` — `test/evidence.integration.test.ts`: 18/18** (13 prior + 5 new,
real Postgres, `--no-file-parallelism`):
- redirects (`302`) to the in-memory fake's deterministic placeholder URL for a
  real, submitted version's evidence;
- `404`s an unknown version;
- `404`s while the version is still a draft (existence not leaked, same as the
  listing);
- `404`s an unknown evidence id on a real version;
- `404`s when the evidence id belongs to a *different* version.

**Invariant / standard coverage (build prompt Section 1):**
- *Object storage for evidence files, content-addressed by hash* — the real
  store is keyed by `evidence/{contentHash}`, unchanged since Sprint 5;
  `put` is idempotent on that key.
- *Reads are public and unauthenticated* — the file endpoint takes no auth,
  consistent with the evidence listing it sits beside.
- *A draft's existence is not leaked* — the file endpoint 404s a draft exactly
  like the listing does.

**Existing suites unchanged and green:** `articles` 18, `reviews` 18,
`disputes` 31, `verification` 11, `redactions` 15, `reader` 18,
`versionVerification` 13, `publisherDashboard` 16, `admin` 12, `anchor` 4,
`me` 3, `registration` 10, `trust` 12, `hardening` 3; `@sourceit/anchoring` 33;
`@sourceit/anchoring-contract` 3; `@sourceit/worker` 15 + 1 skipped.

**Verification environment.** No real S3-compatible bucket or credentials here
— but unlike the chain provider, that gap only affects the (untested-by-design)
live network path; the store's actual logic, including URL signing, is fully
exercised without one. Real PostgreSQL 16.14 via `initdb`/`pg_ctl` on a
non-temp path for the DB-backed tests, torn down afterward; no process holds
port 55432.

**CI is green** (established two sessions ago); this sprint adds
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` to `apps/api` — no
network access needed in CI since the tests never call a real endpoint.

## 8. Outcome

**Evidence files are real.** With `OBJECT_STORE_BUCKET` configured, an attached
file survives a restart, and `GET /versions/{id}/evidence/{evidenceId}/file`
redirects a reader straight to it via a short-lived signed URL — the "View
File" button, inert since it was built, now works. Unset, dev and CI keep the
in-memory fake, unchanged. 259/260 tests green (1 pre-existing, unrelated skip
from Sprint 16).

**Not done, deliberately or blocked:**
- **No real bucket has been provisioned or exercised end to end** — no cloud
  account/credentials in this environment. The store's logic (signing,
  idempotent put, get, not-found handling) is fully unit-tested against a real
  `S3Client` with dummy credentials (signing needs no network call); only the
  actual HTTP round-trip to a live bucket is unverified, and `RUNBOOK.md` has
  the setup + sanity-check steps.
- **`ObjectStore.get()` has no caller.** It existed on the interface before this
  sprint and remains complete and tested but unused — a server-side read
  (re-hashing on demand, a thumbnail pipeline, etc.) would use it; nothing in
  the product needs one yet.
- **No admin tooling to browse or delete stored evidence.** Not asked for; would
  need its own authorization story if built.
- **The real `SourceArchiver` (SSRF-guarded) is still unbuilt** — this was the
  other named fake in Evidence's "Third-party systems in scope" section and
  remains the top item in `THREAT_MODEL.md`.

**Known debt incurred:**
- **A static access key in `api`'s env**, scoped to one bucket. A future pass
  could move to short-lived STS credentials; noted in the threat model.
- **No lifecycle/expiry policy on the bucket** — deliberate (evidence is
  append-only, meant to persist as long as its version), but worth stating
  explicitly so nobody attaches one by habit.
- Carried, unchanged: the Drizzle anchoring-index snapshot drift;
  `articles.repository.ts`'s millisecond cursor; Sprint 16's unrun live chain
  test.

**Blocked on:** nothing (provisioning a bucket is a deploy step, not a
blocker).

**Next steps:** the real `SourceArchiver` with the SSRF guard `THREAT_MODEL.md`
specifies (the last of the three named external fakes); then the
`anchor_failed` admin re-queue; then the remaining frontend wiring, and
deploying the Sprint 16 contract to run its live test.
