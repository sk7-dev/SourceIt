// Plain-Node smoke test for the rate-limit wiring (Phase 5). Run as a
// subprocess by test/hardening.integration.test.ts because @fastify/rate-limit's
// in-memory store misbehaves under vitest's module runner (works fine in real
// Node). This inlines the same config as src/plugins/rateLimit.ts —
// readMax 3 / writeMax 2, health checks exempt, the { code, message } envelope,
// and the tighter per-route budget for mutating methods — and asserts it over
// real HTTP. Exits 0 on success, 1 with a message on failure.
const Fastify = require("fastify");
const rateLimit = require("@fastify/rate-limit");

const READ_MAX = 3;
const WRITE_MAX = 2;
const WINDOW_MS = 60_000;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  const first = typeof xff === "string" ? xff.split(",")[0].trim() : "";
  if (first) return first;
  try {
    return req.ip || "anon";
  } catch {
    return "anon";
  }
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

(async () => {
  const app = Fastify();
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.some((m) => MUTATING.has(m))) {
      route.config = { ...route.config, rateLimit: { max: WRITE_MAX, timeWindow: WINDOW_MS } };
    }
  });
  await app.register(rateLimit, {
    max: READ_MAX,
    timeWindow: WINDOW_MS,
    keyGenerator: (req) => clientIp(req),
    allowList: (req) => req.url === "/healthz" || req.url === "/readyz",
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      code: "RATE_LIMITED",
      message: `Rate limit exceeded — retry after ${Math.ceil(Number(context.after) / 1000) || 60}s`,
    }),
  });
  app.get("/r", async () => ({ ok: true }));
  app.post("/w", async () => ({ ok: true }));
  app.get("/healthz", async () => ({ ok: true }));

  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const hit = (path, method = "GET") => fetch(`${base}${path}`, { method }).then((r) => r);

  // reads: READ_MAX ok, then 429
  const reads = [];
  for (let i = 0; i < READ_MAX + 2; i++) reads.push((await hit("/r")).status);
  if (reads.slice(0, READ_MAX).some((s) => s !== 200)) fail(`reads under budget not all 200: ${reads}`);
  if (reads.slice(READ_MAX).some((s) => s !== 429)) fail(`reads over budget not 429: ${reads}`);

  const limited = await hit("/r");
  const body = await limited.json();
  if (limited.status !== 429 || body.code !== "RATE_LIMITED") fail(`429 envelope wrong: ${limited.status} ${JSON.stringify(body)}`);
  if (!/retry after/i.test(body.message || "")) fail(`429 message wrong: ${body.message}`);

  // writes get the tighter budget
  const writes = [];
  for (let i = 0; i < WRITE_MAX + 1; i++) writes.push((await hit("/w", "POST")).status);
  if (writes[WRITE_MAX] !== 429) fail(`write budget not enforced: ${writes}`);

  // health never limited
  for (let i = 0; i < 10; i++) {
    if ((await hit("/healthz")).status !== 200) fail("health check was rate limited");
  }

  await app.close();
  console.log("OK");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
