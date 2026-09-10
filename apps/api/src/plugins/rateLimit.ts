import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The client IP for rate limiting. Behind Railway's proxy the socket peer is
// the proxy, so trust the first hop of `x-forwarded-for` (we are the only
// trusted hop); fall back to the socket address. Fastify's built-in
// `trustProxy` is deliberately not used — it turns `@fastify/rate-limit` into a
// no-op under `app.inject`.
function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string {
  const xff = req.headers["x-forwarded-for"];
  const first = typeof xff === "string" ? xff.split(",")[0]!.trim() : "";
  if (first) return first;
  try {
    return req.ip || "anon";
  } catch {
    return "anon";
  }
}

export interface RateLimitConfig {
  readMax: number;
  writeMax: number;
  windowMs: number;
}

// One global per-IP budget for reads; mutating requests (POST/PATCH/PUT/DELETE)
// get the tighter `writeMax` via a per-route override attached in the `onRoute`
// hook. Health checks are never limited. 429s use the same `{ code, message }`
// envelope as every other error. Extracted from app.ts so a plain-Node smoke
// test (test/fixtures/rate-limit-smoke.cjs) can exercise the same wiring —
// @fastify/rate-limit's store misbehaves under vitest's module runner.
// Must be `await`ed before any routes are registered — a non-awaited
// `register` of @fastify/rate-limit's global hook silently fails to attach when
// further `register` calls follow it (Fastify v5 + rate-limit v10).
export async function configureRateLimit(app: FastifyInstance, cfg: RateLimitConfig) {
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.some((m) => MUTATING.has(m))) {
      route.config = { ...route.config, rateLimit: { max: cfg.writeMax, timeWindow: cfg.windowMs } };
    }
  });

  await app.register(rateLimit, {
    max: cfg.readMax,
    timeWindow: cfg.windowMs,
    keyGenerator: (req) => clientIp(req),
    allowList: (req) => req.url === "/healthz" || req.url === "/readyz",
    // `statusCode` is required here — without it @fastify/rate-limit sends the
    // body with a 500.
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      code: "RATE_LIMITED",
      message: `Rate limit exceeded — retry after ${Math.ceil(Number(context.after) / 1000) || 60}s`,
    }),
  });
}
