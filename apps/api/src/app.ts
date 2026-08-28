import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./env";
import { db as defaultDb } from "./db";
import { verifyClerkSession, type SessionVerifier } from "./auth/verifySession";
import { createRequireActor, createResolveOptionalActor } from "./auth/requireActor";
import { createAccountsRepository } from "./repositories/accounts.repository";
import { registerErrorHandler } from "./plugins/errorHandler";
import { registerRequestLogging } from "./plugins/requestLogging";
import { registerHealthRoutes } from "./routes/health.route";
import { registerMeRoute } from "./routes/me.route";
import { registerArticleRoutes } from "./routes/articles.route";
import { registerPublisherArticlesRoute } from "./routes/publisherArticles.route";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof defaultDb;
    requireActor: ReturnType<typeof createRequireActor>;
    resolveOptionalActor: ReturnType<typeof createResolveOptionalActor>;
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

  // The frontend runs on a different origin (Vite's dev server, or wherever
  // it's deployed) — without this, every authenticated request's CORS
  // preflight (triggered by the Authorization header) 404s and the browser
  // silently blocks the real request before it's ever sent.
  app.register(cors, {
    origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",") : env.NODE_ENV === "development",
  });

  const db = options.db ?? defaultDb;
  app.decorate("db", db);
  app.decorate("verifySession", options.verifySession ?? verifyClerkSession);

  const accountsRepo = createAccountsRepository(db);
  app.decorate("requireActor", createRequireActor(accountsRepo));
  app.decorate("resolveOptionalActor", createResolveOptionalActor(accountsRepo));

  registerErrorHandler(app);
  registerRequestLogging(app);
  registerHealthRoutes(app);
  registerMeRoute(app);
  registerArticleRoutes(app);
  registerPublisherArticlesRoute(app);

  return app;
}
