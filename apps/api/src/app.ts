import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { db as defaultDb } from "./db";
import { verifyClerkSession, type SessionVerifier } from "./auth/verifySession";
import { registerErrorHandler } from "./plugins/errorHandler";
import { registerRequestLogging } from "./plugins/requestLogging";
import { registerHealthRoutes } from "./routes/health.route";
import { registerMeRoute } from "./routes/me.route";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof defaultDb;
  }
}

export interface BuildAppOptions {
  db?: typeof defaultDb;
  verifySession?: SessionVerifier;
}

// The single place the app is assembled — used by src/server.ts to actually
// listen, and by test/testApp.ts to build the same app against a Testcontainers
// Postgres with a fake session verifier (see src/auth/verifySession.ts for why).
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    // Structured JSON logging, one request ID threaded through every log line
    // (cross-cutting standard).
    logger: true,
    genReqId: () => randomUUID(),
  });

  app.decorate("db", options.db ?? defaultDb);
  app.decorate("verifySession", options.verifySession ?? verifyClerkSession);

  registerErrorHandler(app);
  registerRequestLogging(app);
  registerHealthRoutes(app);
  registerMeRoute(app);

  return app;
}
