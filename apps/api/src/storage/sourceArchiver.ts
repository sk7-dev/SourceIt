// Fetches and snapshots an external source URL at the moment evidence is
// attached, so verification of a version does not silently degrade when a
// third-party link later rots (docs/PROJECT_STATE.md decision 2026-08-26,
// resolving OPEN_QUESTIONS.md #7). Abstracted behind an interface: the real
// implementation below does a guarded server-side fetch (SSRF allow/deny-
// listing, redirect and body-size caps, timeouts) — the single most
// important item named in docs/THREAT_MODEL.md's Evidence section (Sprint 18).
import { BlockList, isIP, type LookupFunction } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { ValidationError } from "../errors";

export interface ArchivedSource {
  bytes: Uint8Array;
  contentType: string;
}

export interface SourceArchiver {
  archive(url: string): Promise<ArchivedSource>;
}

// Deterministic: the same URL always snapshots to the same bytes, so a test
// (or a caller) can predict the resulting content hash without a network.
// Kept as the test/dev default (see apps/api/test/testApp.ts) — offline and
// reproducible, exactly like createFakeAnchorProvider before Sprint 16.
export function createFakeSourceArchiver(): SourceArchiver {
  return {
    async archive(url) {
      const bytes = new TextEncoder().encode(`archived-snapshot:${url}`);
      return { bytes, contentType: "application/octet-stream" };
    },
  };
}

// --- SSRF guard: address ranges a server-side fetch must never reach -------
// RFC 1918 / RFC 6598 private ranges, loopback, link-local (incl. the
// 169.254.169.254 cloud metadata endpoint every major provider uses),
// multicast, and the IETF/benchmark/reserved blocks. `net.BlockList` already
// cross-checks an IPv4-mapped IPv6 literal (`::ffff:127.0.0.1`) against the
// IPv4 rules below when checked as "ipv6" — verified directly against this
// exact rule set; do NOT also add an `::ffff:0:0/96` "ipv6" rule, which was
// tried and confirmed (empirically) to make BlockList treat every plain IPv4
// address, including public ones, as blocked.
const IPV4_BLOCKED_SUBNETS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT (RFC 6598)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
];

const IPV6_BLOCKED_SUBNETS: Array<[string, number]> = [
  ["::1", 128], // loopback
  ["::", 128], // unspecified
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

const blockList = new BlockList();
for (const [net, prefix] of IPV4_BLOCKED_SUBNETS) blockList.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of IPV6_BLOCKED_SUBNETS) blockList.addSubnet(net, prefix, "ipv6");

// Exported for direct unit testing against literal addresses — no DNS or
// network needed to verify the guard itself.
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockList.check(address, "ipv4");
  if (family === 6) return blockList.check(address, "ipv6");
  return true; // not a literal IP we recognize — fail closed
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface HopResult {
  statusCode: number;
  location?: string;
  contentType: string;
  bytes: Uint8Array;
}

// Injectable seams (mirrors createChainAnchorProvider(ops) / createS3ObjectStore's
// injectable client): `resolveAddresses` is real DNS in production; tests
// substitute it to drive the redirect/size-cap/status-handling logic without
// touching the network or the (loopback-blocking) guard. `performHop` is the
// real single-hop HTTP(S) fetch against an already-validated numeric address;
// its own default implementation is tested separately against a real local
// server (which performHop, unlike the guard, has no reason to reject).
export interface GuardedSourceArchiverDeps {
  resolveAddresses(hostname: string): Promise<ResolvedAddress[]>;
  performHop(address: string, family: 4 | 6, url: URL, maxBytes: number, timeoutMs: number): Promise<HopResult>;
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}

async function defaultResolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
}

// The real single-hop transport. Forces the connection to the pre-validated
// `address` via a custom `lookup` (so the request can never re-resolve the
// hostname at connect time and land on a different, unvalidated IP — the
// classic DNS-rebinding TOCTOU gap) while keeping `url.hostname` as the Host
// header / TLS SNI value. Never follows redirects itself — the orchestration
// in createGuardedSourceArchiver re-validates every hop's target the same way
// as the first.
//
// Exported so it can be unit-tested directly against a real local server —
// unlike createGuardedSourceArchiver's address guard (which always rejects
// loopback), this function has no opinion on `address` and is safe to point
// at 127.0.0.1 in a test.
export function nodeHttpPerformHop(
  address: string,
  family: 4 | 6,
  url: URL,
  maxBytes: number,
  timeoutMs: number,
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    // Node's http/https client calls `lookup` with `options.all: true` (Happy
    // Eyeballs), which requires an array of `{ address, family }` back rather
    // than the single-address positional form — verified directly against a
    // real request; passing a bare string there fails with a confusing
    // "Invalid IP address: undefined".
    const forcedLookup: LookupFunction = (_hostname, options, callback) => {
      if (typeof options === "object" && options.all) {
        callback(null, [{ address, family }]);
      } else {
        callback(null, address, family);
      }
    };

    const req = request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        signal: controller.signal,
        headers: { "user-agent": "SourceIt-Archiver/1.0", accept: "*/*" },
        lookup: forcedLookup,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        const contentType = res.headers["content-type"] ?? "application/octet-stream";

        const declaredLength = Number(res.headers["content-length"] ?? 0);
        if (declaredLength > maxBytes) {
          res.destroy();
          finish(() => reject(new ValidationError("Source URL response exceeds the size limit")));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy();
            finish(() => reject(new ValidationError("Source URL response exceeds the size limit")));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          finish(() => resolve({ statusCode, location, contentType, bytes: new Uint8Array(Buffer.concat(chunks)) }));
        });
        res.on("error", (err) => finish(() => reject(err)));
      },
    );

    req.on("error", (err) => {
      if (controller.signal.aborted) {
        finish(() => reject(new ValidationError("Timed out fetching source URL")));
      } else {
        finish(() => reject(new ValidationError(`Could not fetch source URL: ${(err as Error).message}`)));
      }
    });
    req.end();
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// The real SourceArchiver (Sprint 18). Production default: 25 MB cap
// (matches the multipart evidence-upload cap in src/app.ts), 15s per hop,
// 5 redirects. Every hop — the original URL and every redirect target — goes
// through the same scheme check + DNS resolution + address-block check
// before any bytes are requested.
export function createGuardedSourceArchiver(overrides: Partial<GuardedSourceArchiverDeps> = {}): SourceArchiver {
  const resolveAddresses = overrides.resolveAddresses ?? defaultResolveAddresses;
  const performHop = overrides.performHop ?? nodeHttpPerformHop;
  const maxBytes = overrides.maxBytes ?? 25 * 1024 * 1024;
  const timeoutMs = overrides.timeoutMs ?? 15_000;
  const maxRedirects = overrides.maxRedirects ?? 5;

  return {
    async archive(rawUrl) {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new ValidationError("sourceUrl is not a valid URL");
      }

      for (let hop = 0; ; hop++) {
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new ValidationError(`Unsupported source URL scheme: ${url.protocol}`);
        }
        if (hop > maxRedirects) {
          throw new ValidationError("Source URL redirected too many times");
        }

        let addresses: ResolvedAddress[];
        try {
          addresses = await resolveAddresses(url.hostname);
        } catch {
          throw new ValidationError("Could not resolve source URL host");
        }
        if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
          throw new ValidationError("Source URL resolves to a disallowed address");
        }

        const { address, family } = addresses[0]!;
        const result = await performHop(address, family, url, maxBytes, timeoutMs);

        if (REDIRECT_STATUSES.has(result.statusCode)) {
          if (!result.location) {
            throw new ValidationError("Source URL redirected without a Location header");
          }
          url = new URL(result.location, url);
          continue;
        }

        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new ValidationError(`Source URL responded with status ${result.statusCode}`);
        }

        return { bytes: result.bytes, contentType: result.contentType };
      }
    },
  };
}
