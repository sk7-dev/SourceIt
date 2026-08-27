import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

// Liveness: the process is up, no dependencies checked.
// Readiness: the process can actually serve traffic (DB reachable) — what a
// load balancer or orchestrator should gate on before routing here.
export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: "ready" };
    } catch (err) {
      app.log.error({ err }, "readiness check failed: database unreachable");
      reply.status(503);
      return { status: "not_ready" };
    }
  });
}
