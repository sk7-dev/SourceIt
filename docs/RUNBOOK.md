# SourceIt — Operations Runbook

Phase 5 (Sprint 15). Target platform: **Railway** (monolith `apps/api` + worker
`apps/worker` + managed PostgreSQL 16), with Fly.io as the documented fallback.
This runbook has not been executed end to end — there is no live deployment yet
— but every command is the real one for that platform.

## Services

| Service | What it is | Scales |
|---|---|---|
| `api` | `apps/api` — Fastify HTTP, all 44 endpoints | horizontally if needed (see "Rate limiting" caveat) |
| `worker` | `apps/worker` — the anchoring batch runner; polls `anchor_records` / `anchor_batches` on a tick | **exactly one instance** — it claims rows with `FOR UPDATE SKIP LOCKED`, but running two doubles chain spend risk; keep it at 1 |
| `postgres` | Railway managed Postgres 16 | vertical only |

Both `api` and `worker` read the same env. Required (Zod-validated at boot —
the process refuses to start if any is missing or malformed):
`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`. Optional:
`CORS_ORIGIN` (comma-separated origins; unset = no cross-origin outside dev),
`PORT` (default 3000), `RATE_LIMIT_MAX` / `RATE_LIMIT_WRITE_MAX` /
`RATE_LIMIT_WINDOW_MS` (defaults 300 / 30 / 60000), and the worker's
`ANCHOR_TICK_MS` / `ANCHOR_MAX_BATCH` / `ANCHOR_MAX_ATTEMPTS` /
`ANCHOR_CONFIRMATIONS`. The worker's chain-anchoring vars
(`ANCHOR_RPC_URL` / `ANCHOR_CHAIN_ID` / `ANCHOR_CONTRACT_ADDRESS` /
`ANCHOR_SIGNER_PRIVATE_KEY` / `ANCHOR_CONTRACT_DEPLOY_BLOCK`) are covered in
**Chain anchoring** below — unset, the worker uses the in-memory fake provider.
`api`'s object-storage vars (`OBJECT_STORE_BUCKET` / `OBJECT_STORE_REGION` /
`OBJECT_STORE_ACCESS_KEY_ID` / `OBJECT_STORE_SECRET_ACCESS_KEY` /
`OBJECT_STORE_ENDPOINT` / `OBJECT_STORE_FORCE_PATH_STYLE` /
`OBJECT_STORE_SIGNED_URL_TTL_SECONDS`) are covered in **Object storage**
below — unset, `api` uses the in-memory fake and evidence never survives a
restart.

## Deploy

1. Merge to `main`. CI (`.github/workflows/ci.yml`) runs `pnpm lint`,
   `pnpm typecheck`, `pnpm test` (the integration suite needs Docker for its
   disposable Postgres — GitHub's `ubuntu-latest` has it).
2. **Run migrations before the new code serves traffic.** Railway: a
   pre-deploy / release command of
   `pnpm --filter @sourceit/shared db:migrate`. It is idempotent (Drizzle's
   `__drizzle_migrations` table tracks what has run) and additive — every
   migration to date is `CREATE` / `ADD COLUMN` / `CREATE INDEX` / a trigger,
   none rewrite or drop data.
3. Deploy `api`, then `worker`. Order does not matter functionally (the worker
   tolerates schema ahead of it), but deploying `api` first surfaces problems
   on the path users hit.
4. Verify: `GET /healthz` → `200`, `GET /readyz` → `200` (checks a DB round
   trip). `GET /articles/{a-known-id}/verification` → `200` with a `trustStatus`.
5. Watch logs for `~1 min`. Every request logs one completion line
   (`method`, `route`, `statusCode`, `responseTime`, `reqId`); an unexpected
   `5xx` logs `err`, `reqId`, `route`, and a stable `fingerprint`
   (`<error code/name> <first in-repo stack frame>`) for grouping in whatever
   log-based alerting the platform provides.

## Roll back

Code and schema roll back **independently** — never assume they move together.

- **Code only** (the common case — a bad deploy, migrations were fine): redeploy
  the previous image / commit in Railway. No DB action. Safe because every
  migration so far is backward-compatible with the immediately prior code
  (additive columns are nullable or defaulted; new tables are unread by old
  code; new indexes are transparent).
- **Schema too** (a migration is the problem): there are no down-migrations.
  Options, least to most drastic:
  1. If the bad migration only *added* an index or a trigger: `DROP INDEX
     <name>;` / `DROP TRIGGER <name> ON <table>;` by hand, then redeploy old
     code. Record it as a follow-up migration.
  2. If it added a table or a nullable column: leave it (old code ignores it),
     redeploy old code, fix forward.
  3. If it did something destructive (none to date): restore from backup — see
     below — accepting data loss back to the snapshot.
- **Worker**: rolling back the worker is always code-only and always safe; it
  has no migrations of its own and its state lives in `anchor_*` rows.

## Run a migration manually

```
DATABASE_URL=<prod url> pnpm --filter @sourceit/shared db:migrate
```

To see what would run without running it: `ls packages/shared/migrations/*.sql`
against the `tag`s already in `select * from drizzle.__drizzle_migrations`.
Never edit a migration file that has run anywhere. Never `drizzle-kit push`
against a deployed database.

A long index build on a large table should be `CREATE INDEX CONCURRENTLY`
(cannot run inside the migrator's transaction — do it by hand in a separate
`psql` session, then add a no-op migration file recording it so the journal
stays honest). `0008`'s two indexes are small and were applied normally.

## Database at ~90% of `max_connections`

Symptoms: `remaining connection slots are reserved` errors, `GET /readyz`
flapping, request `responseTime` climbing.

1. **Confirm the culprit**:
   ```sql
   select state, count(*), max(now() - state_change) as oldest
   from pg_stat_activity where datname = current_database()
   group by state order by 2 desc;
   ```
   A pile of `idle in transaction` is a leaked transaction (a bug); a pile of
   `idle` is just too many pooled clients.
2. **Immediate relief**: scale `api` down by one instance (each holds a `pg`
   Pool). If a single instance is the whole pool, lower its pool size via the
   `pg` Pool `max` (currently default 10 in `apps/api/src/db.ts` /
   `apps/worker`) and redeploy.
3. **Kill leaked transactions** older than a few minutes:
   ```sql
   select pg_terminate_backend(pid) from pg_stat_activity
   where datname = current_database() and state = 'idle in transaction'
     and now() - state_change > interval '5 minutes';
   ```
4. **Root cause**: `idle in transaction` means a code path opened a transaction
   and did not commit/rollback — grep for `db.transaction(` and any manual
   `BEGIN`. The services are `await`-linear and the repositories do single
   statements, so this would be a regression to hunt in the latest diff.
5. **Capacity**: bump the Postgres plan (more `max_connections`) or put
   PgBouncer (transaction pooling) in front — the app holds no session state in
   Postgres, so transaction pooling is safe.

## Rate limiting

`@fastify/rate-limit` uses an **in-process** token bucket keyed by client IP
(first hop of `X-Forwarded-For`, else the socket address). This is correct for
**one** `api` instance. If `api` is scaled to N instances the effective limit is
N × the configured value; to make it exact across instances, register the plugin
with its Redis store and add a Redis service — a one-option change in
`src/plugins/rateLimit.ts`. Health checks (`/healthz`, `/readyz`) are never
limited.

## Anchoring worker stuck

- `anchor_records` rows stuck `pending` with no progress: check the worker is
  running and its log tick. It claims work every `ANCHOR_TICK_MS` (default from
  env).
- A batch at `anchor_failed`: it exhausted `ANCHOR_MAX_ATTEMPTS`. There is **no
  admin re-queue endpoint yet** (known debt). Manual recovery:
  `update anchor_batches set status = 'pending', attempts = 0,
  next_attempt_at = null where id = '<batch id>';` and
  `update anchor_records set status = 'pending' where anchor_batch_id =
  '<batch id>';` — then the worker retries on its next tick. Only do this once
  the underlying chain/provider problem is fixed.

## Chain anchoring

Unset `ANCHOR_RPC_URL` → the worker uses the in-memory fake provider (roots are
"mined" instantly, nothing on-chain). This is fine for a staging environment
where verification against a real chain isn't required. To anchor for real:

**One-time setup**

1. Pick the chain. Base Sepolia (`ANCHOR_CHAIN_ID=84532`,
   `ANCHOR_RPC_URL=https://sepolia.base.org`) for a testnet; Base mainnet is
   `8453` + a mainnet RPC. The provider is chain-agnostic EVM JSON-RPC — any L2
   works with the right id + RPC.
2. Create a **dedicated** signing key (not a personal wallet). Fund it: a faucet
   for testnet; a small ETH float (a few dollars covers thousands of batch
   txs on an L2) for mainnet.
3. Deploy the Anchor contract:
   ```
   ANCHOR_RPC_URL=… ANCHOR_CHAIN_ID=… ANCHOR_SIGNER_PRIVATE_KEY=0x… \
     pnpm --filter @sourceit/anchoring-contract deploy
   ```
   It prints `{ address, deployBlock, solcVersion, sourceSha256 }`.
4. Set the worker env: `ANCHOR_RPC_URL`, `ANCHOR_CHAIN_ID`,
   `ANCHOR_CONTRACT_ADDRESS` (the printed address), `ANCHOR_SIGNER_PRIVATE_KEY`,
   and `ANCHOR_CONTRACT_DEPLOY_BLOCK` (the printed block — bounds the
   `Anchored` log scan, important on mainnet). Redeploy the worker; its startup
   log line reports `"provider":"chain"`.
5. Sanity-check: publish a version, wait a couple of ticks, then
   `GET /versions/{id}/anchor` — `chainTxHash` should be a real transaction you
   can open on the chain's explorer, and `verifyInclusionProof` +
   `chainTxHash`/`blockHeight` reproduce the anchored root.

**Signer out of gas** — `provider.submit` throws, the batch's `attempts`
climbs, and after `ANCHOR_MAX_ATTEMPTS` the batch is `anchor_failed` and its
records show `anchor_failed` to readers (never a false "verified"). Recovery:
top the signer up, then re-queue the failed batch with the SQL in **Anchoring
worker stuck** above. Monitor the signer balance and alert well before zero.

**Key rotation** — deploy nothing new; the contract accepts `anchor()` from any
sender. Fund a new key, swap `ANCHOR_SIGNER_PRIVATE_KEY`, redeploy the worker.
In-flight `submitted` batches resume fine — `getReceipt` is a log lookup, not
tied to the sender.

**Testnet → mainnet** — deploy a fresh contract on mainnet (step 3 with mainnet
env), point the worker at it, and fund a mainnet key. Roots already anchored on
testnet do **not** migrate; historical `anchor_records` keep their testnet
`chain_tx_hash` / `block_height`. Plan the cutover for a low-traffic window and
accept that pre-cutover versions are verifiable only against the testnet
contract (record which contract covers which date range).

**Production hardening (deferred)** — replace the raw env key with a KMS-backed
signer or a gas relayer (Gelato / OpenZeppelin Defender / a Base paymaster) so
no private key lives in the worker env. The `ChainOps` seam in
`chainAnchorProvider.ts` is where that swaps in.

## Object storage

Unset `OBJECT_STORE_BUCKET` → `api` uses an in-memory fake: evidence uploads
work, but nothing survives a restart and "View File" redirects to a
non-functional `memory://` placeholder. Any S3-compatible provider works —
Cloudflare R2 is the cheapest fit (no egress fees, S3 API); AWS S3, Backblaze
B2, and MinIO are equally supported.

**One-time setup**

1. Create a **private** bucket (no public-read ACL — evidence is served only
   through the signed-URL redirect endpoint, never a stable public link).
2. Create an access key scoped to that bucket only (`GetObject` / `PutObject` /
   `HeadObject`).
3. Set `api`'s env: `OBJECT_STORE_BUCKET`, `OBJECT_STORE_REGION` (R2: `auto`),
   `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY`, and — for
   anything but real AWS S3 — `OBJECT_STORE_ENDPOINT` (R2:
   `https://<account id>.r2.cloudflarestorage.com`). MinIO and some
   self-hosted servers also need `OBJECT_STORE_FORCE_PATH_STYLE=true`.
   Redeploy `api`.
4. Sanity-check: attach evidence to a draft version, then
   `GET /versions/{id}/evidence/{evidenceId}/file` — it should `302` to a
   `https://…X-Amz-Signature=…` URL that downloads the file. Restart `api` and
   confirm the file is still there (proves it survived the fake's in-memory
   lifetime).

**No migration for existing data.** Nothing was ever persisted by the fake —
there is nothing to move. All evidence attached after this is configured goes
to the real bucket.

**Signed-URL lifetime** — `OBJECT_STORE_SIGNED_URL_TTL_SECONDS` (default 900).
A copied "View File" link stops working after this; the reader re-opens the
verification page and clicks again for a fresh one. Lower it for tighter
exposure, raise it if readers report the click-to-open flow taking a while.

**Bucket size / cost** — evidence is content-addressed, so the same file
attached to two versions (or re-attached) is stored once. There is no
lifecycle/expiry policy configured — evidence is meant to persist as long as
the version it's evidence for (append-only, per the build prompt); do not
attach a bucket lifecycle rule that deletes objects.

## Backups and restore

**Not yet configured or tested — this section is the plan, not a record.**

- **Backups**: enable Railway's automated Postgres snapshots (daily, ≥7-day
  retention). Independently, a nightly logical dump to object storage:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > sourceit-$(date +%F).dump`.
  The logical dump is the portable one (survives leaving Railway).
- **Restore drill** (run once, in staging, then quarterly):
  1. Provision a fresh empty Postgres.
  2. `pg_restore --clean --if-exists --no-owner --dbname "$STAGING_URL"
     sourceit-<date>.dump`.
  3. Point a staging `api` at it; hit `GET /readyz` and
     `GET /articles/{id}/verification` for a known article.
  4. Confirm row counts for `articles`, `article_versions`, `anchor_records`,
     `disputes` match the source within the snapshot window.
  5. Record the wall-clock restore time — that is the RTO number.
- **What a restore loses**: everything written after the snapshot. The chain
  anchors are the durable root of trust — a version whose hash was anchored
  before the snapshot is still verifiable against the chain even if its
  Postgres row is lost, but its evidence blobs, reviews, and disputes written
  after the snapshot are gone. This is why the append-only tables matter: the
  gap is visible, not silent.
