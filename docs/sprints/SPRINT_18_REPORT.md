# Sprint 18 — Real SourceArchiver (SSRF-guarded)

**Dates:** 2026-09-12 → 2026-09-12  ·  **Status:** Complete with carryover

## 1. Objective

The last of the three named fakes from the build prompt's "Third-party systems
in scope" — after the chain provider (Sprint 16) and the object store
(Sprint 17) — and, per `docs/THREAT_MODEL.md`, the single most important open
item: a `tag=source` evidence item's `sourceUrl` was archived by
`createFakeSourceArchiver`, which never touches the network. A real archiver
must fetch the URL server-side without becoming an SSRF vector — the classic
risk of "paste a URL, server fetches it" is that the URL points at an internal
service (a cloud metadata endpoint, an admin panel on localhost, an internal
API on a private IP) instead of a real public source.

Two points were confirmed with the user before implementation: (1) build this
sprint next, since it's the last named fake and the top item in the threat
model; (2) implement the IP-range validation by hand on `node:net`'s
`BlockList`/`isIP` rather than adding a dedicated SSRF-guard npm dependency —
consistent with this codebase's existing dependency-averse style (zero-dep
`packages/anchoring`, no HTTP client library anywhere in `apps/api`).

## 2. Changes from Previous Sprint

- **`apps/api/src/storage/sourceArchiver.ts`** gained `createGuardedSourceArchiver`
  (the new default), `isBlockedAddress` (exported for direct testing), and
  `nodeHttpPerformHop` (the real single-hop transport, also exported for direct
  testing). `createFakeSourceArchiver` is unchanged and kept as the offline
  test/dev-time substitute.
- **`app.ts`** — the default `SourceArchiver` is now `createGuardedSourceArchiver()`
  (previously the fake). Unlike the chain provider and object store, there's no
  env toggle: the guarded fetch needs no credentials to provision, so it's the
  unconditional default; an explicit `options.sourceArchiver` (tests) still wins.
- **`test/testApp.ts`** now passes `sourceArchiver: createFakeSourceArchiver()`
  explicitly, for the same reason it already substitutes `verifySession`: the
  integration suite has no network access and needs the fake's deterministic
  `archived-snapshot:<url>` bytes (asserted in `evidence.integration.test.ts`).
- **New `test/sourceArchiver.unit.test.ts`** — 40 tests, no DB, no network (see
  §7).
- **`docs/THREAT_MODEL.md`** — the SSRF row in the Evidence section flips from
  Open to Closed, with the mechanism; a new residual-risk bullet notes the
  guard blocks by IP range, not a hostname allow-list, and doesn't restrict
  destination ports (a public host proxying to an internal service is outside
  its reach — standard for this class of defense).
- **Carried over, unchanged:** no admin re-queue for `anchor_failed`; the
  Sprint 16 chain provider's live testnet run still pending a deploy; no real
  bucket provisioned here (Sprint 17); the publisher-dashboard + reader
  frontend components still hardcoded; no backend search.

## 3. Key Enhancements

- **DNS-then-block, not block-then-DNS.** For the original URL and every
  redirect target, the archiver resolves the hostname via `dns.promises.lookup`
  (`all: true`, both address families) and rejects the whole request if *any*
  resolved address is in a blocked range — not just the first one a
  round-robin DNS answer happens to return first.
- **The blocked-range list**: RFC 1918 (`10/8`, `172.16/12`, `192.168/16`),
  loopback (`127/8`, `::1`), link-local incl. the `169.254.169.254` cloud
  metadata address every major provider uses (`169.254/16`, `fe80::/10`),
  CGNAT (`100.64/10`), unique-local IPv6 (`fc00::/7`), multicast
  (`224/4`, `ff00::/8`), the "this network" and reserved blocks (`0/8`,
  `240/4`), IETF protocol assignments (`192.0.0/24`) and the benchmarking
  range (`198.18/15`). An IPv4-mapped IPv6 literal (`::ffff:127.0.0.1`) is
  caught too — `node:net`'s `BlockList`, verified directly, already
  cross-checks a `"ipv6"`-typed check against the `"ipv4"` rules when the
  address is in that mapped form; no separate handling needed (see §4 for the
  rule that looked right but wasn't).
- **DNS-rebinding is closed at the transport, not just the check.** The actual
  socket connects via a custom `lookup` option that always returns the
  address already validated above — never a second, unvalidated DNS
  resolution at connect time. The `Host` header and TLS SNI still use the
  real hostname (untouched `url.hostname` in the request options).
- **Redirects are followed by hand**, not by the HTTP client: a 3xx status +
  `Location` triggers a fresh loop iteration that re-validates the new URL's
  scheme, re-resolves its host, and re-checks the blocked-address list exactly
  as the first hop — a redirect can't be used to reach an address the initial
  check would have rejected. Capped at 5 hops.
- **Bounded regardless of what the server does**: a declared `Content-Length`
  over 25 MB is rejected before any body bytes are read; a streamed response
  (chunked or a lying `Content-Length`) is aborted mid-transfer the moment it
  crosses the cap. Each hop times out at 15s via an `AbortController`.

## 4. Architecture Changes

- **Injectable seams, same shape as the chain provider's `ChainOps` and the
  object store's `S3Client`.** `createGuardedSourceArchiver(overrides)` takes
  `resolveAddresses` and `performHop` as optional dependencies; production
  uses real `dns.promises.lookup` and the real Node `http`/`https` transport,
  tests substitute fakes for the redirect/size-cap/status orchestration
  without touching the network or the (loopback-blocking) guard. The real
  transport (`nodeHttpPerformHop`) is separately testable on its own, against
  a real local server, since it has no opinion on the address it's given —
  only the composed `archive()` function's own DNS-resolve step enforces the
  block-list.
- **No new package, no schema change.** `apps/api`'s only new import is
  `node:net` / `node:dns/promises` / `node:http` / `node:https` — all Node
  built-ins, per the confirmed decision not to add an SSRF-guard dependency.

## 5. Database Changes

**None.**

## 6. New Components

**`apps/api` changed:** `storage/sourceArchiver.ts` (real archiver added,
fake kept), `app.ts` (default swapped).
**`apps/api` test-only:** `test/testApp.ts` (pins the fake explicitly),
new `test/sourceArchiver.unit.test.ts`.
**No new endpoint, no contract change** — `POST /versions/{id}/evidence` with
`tag=source` is unchanged at the API surface; only what happens behind
`archiver.archive(sourceUrl)` is new.

## 7. Sprint Test Results

**New: `test/sourceArchiver.unit.test.ts` — 40/40, verified, no DB or network
needed.**

- `isBlockedAddress` — 18 blocked literals (every RFC 1918 range, loopback,
  `169.254.169.254`, CGNAT, multicast, reserved/broadcast, the IETF and
  benchmarking blocks, `::1`, `fe80::1`, `fd00::1`, `ff02::1`,
  `::ffff:127.0.0.1`, and a non-IP string failing closed) and 7 allowed
  literals (public IPv4/IPv6 addresses, including a public IPv4-mapped-IPv6
  literal, `::ffff:8.8.8.8`, correctly *not* blocked).
- `createGuardedSourceArchiver` orchestration (injected `resolveAddresses` /
  `performHop`, no real network): returns bytes + content type on a plain 200;
  rejects an unsupported scheme before ever resolving or fetching; rejects
  when the resolved address is blocked, and specifically when *any* of
  several resolved addresses is blocked; rejects on a DNS-resolution failure;
  follows one redirect end to end, asserting `resolveAddresses` is called a
  second time for the redirect target's own hostname; rejects a redirect with
  no `Location`; rejects once redirects exceed the configured maximum;
  rejects a non-2xx final status; rejects an unparseable URL.
- `nodeHttpPerformHop` against a real local `http.createServer()` (loopback,
  which this function — unlike the guard — has no reason to reject): fetches
  real bytes/status/content-type; surfaces a redirect's status and `Location`
  without following it; aborts once a streamed response exceeds the byte cap;
  rejects a declared `Content-Length` over the cap without reading the body;
  times out a response that never arrives.

**Verified this session:** `pnpm typecheck` (0 errors, all five packages),
`pnpm lint` (0 errors/warnings, all five packages), the new unit test file
(40/40).

**Not run this session:** the full DB-backed `apps/api` integration suite (no
Postgres instance was available here; standing one up needs rebuilding the
embedded-postgres workaround from Sprint 11's notes). The only production-code
change outside `sourceArchiver.ts` is the one-line default swap in `app.ts`,
exactly mirrored by pinning the previous default explicitly in `test/testApp.ts`
— a like-for-like substitution, not a behavior change, for every existing
integration test. The previously-verified 208/208 `apps/api` total (Sprint 17)
is not re-confirmed here; `evidence.integration.test.ts`'s `tag=source` tests in
particular are expected unaffected since they exercise the (now explicitly
pinned) fake exactly as before.

**Two things were verified empirically before being relied on** (both
recorded in `docs/PROJECT_STATE.md`'s decision log):
- `net.BlockList` cross-checking behavior for IPv4-mapped IPv6 addresses —
  confirmed directly against a running Node process, including the wrong
  answer first (adding an `"ipv6"` `::ffff:0:0/96` rule blocked every plain
  IPv4 address, public ones included) and the working alternative (no such
  rule needed at all).
- `http.request`'s custom `lookup` option's calling convention — confirmed
  directly that it's invoked with `{ all: true }` and expects an array back,
  not the single-address form; the first implementation failed every real
  request until this was fixed.

## 8. Outcome

**The real `SourceArchiver` is built and is the default.** `tag=source`
evidence now goes through a guarded fetch: DNS-resolved, address-checked
against a private/loopback/link-local/CGNAT/multicast/metadata block-list
(every resolved address, not just the first), connected via a forced address
(closing the DNS-rebinding gap), scheme-restricted to `http`/`https`, capped
at 25 MB, timed out at 15s, and redirect-followed by hand with the same
validation re-applied per hop (max 5). `docs/THREAT_MODEL.md`'s SSRF row moves
from Open to Closed. Dev and CI need no configuration — the guard runs by
default; tests get the deterministic fake explicitly.

**Not done, deliberately or blocked:**
- **No hostname allow-list** — any public host is reachable, by design (a
  source can be any public article URL); the guard is IP-range-based, not
  host-based, and doesn't restrict destination ports. Documented as residual
  risk, not a gap, in `THREAT_MODEL.md`.
- **No live-network test against a real external URL** — every test uses
  either literal addresses (no DNS) or a real local server (no real DNS
  either, `dns.promises.lookup` itself is only exercised through the injected
  fake in orchestration tests). The real `defaultResolveAddresses` (real
  `dns.promises.lookup`) is exercised only by construction, not by a dedicated
  test, since doing so needs outbound network access this environment doesn't
  have — the same class of gap as the chain provider's live testnet run.
- **The full DB-backed integration suite wasn't re-run this session** (see §7)
  — no Postgres instance was available; the change is a like-for-like default
  substitution mirrored explicitly in the test harness.

**Known debt incurred:** none new. The guard's IP-range list is a fixed set of
well-known ranges, not configurable — matches how the multipart upload cap and
other constants in this codebase are hardcoded rather than env-configurable
until a real need for tuning appears.

**Blocked on:** nothing.

**Next steps:** the `anchor_failed` admin re-queue; the Sprint 16 chain
provider's live testnet run (deploy + fund); provisioning and exercising a real
object-store bucket end to end; the remaining hardcoded frontend components.
