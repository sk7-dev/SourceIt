import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./env";
import { db as defaultDb } from "./db";
import { createInMemoryObjectStore, type ObjectStore } from "./storage/objectStore";
import { createFakeSourceArchiver, type SourceArchiver } from "./storage/sourceArchiver";
import { verifyClerkSession, type SessionVerifier } from "./auth/verifySession";
import { createRequireActor, createResolveOptionalActor } from "./auth/requireActor";
import { createAccountsRepository } from "./repositories/accounts.repository";
import { registerErrorHandler } from "./plugins/errorHandler";
import { registerRequestLogging } from "./plugins/requestLogging";
import { registerHealthRoutes } from "./routes/health.route";
import { registerMeRoute } from "./routes/me.route";
import { registerArticleRoutes } from "./routes/articles.route";
import { registerPublisherArticlesRoute } from "./routes/publisherArticles.route";
import { registerAnchorRoute } from "./routes/anchor.route";
import { registerEvidenceRoutes } from "./routes/evidence.route";
import { registerReviewRoutes } from "./routes/reviews.route";
import { registerVersionVerificationRoute } from "./routes/versionVerification.route";
import { registerDisputeRoutes } from "./routes/disputes.route";
import { registerVerificationRoute } from "./routes/verification.route";
import { registerAdminRoutes } from "./routes/admin.route";
import { registerRegistrationRoutes } from "./routes/registration.route";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof defaultDb;
    objectStore: ObjectStore;
    sourceArchiver: SourceArchiver;
    requireActor: ReturnType<typeof createRequireActor>;
    resolveOptionalActor: ReturnType<typeof createResolveOptionalActor>;
  }
}

export interface BuildAppOptions {
  db?: typeof defaultDb;
  verifySession?: SessionVerifier;
  // Both default to the in-memory / fake implementation — a real object store
  // and a real guarded URL archiver are later, swappable concerns (see the
  // storage/ modules and docs/PROJECT_STATE.md).
  objectStore?: ObjectStore;
  sourceArchiver?: SourceArchiver;
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

  // Evidence uploads (POST /versions/{id}/evidence) are multipart/form-data —
  // the one endpoint that isn't JSON. 25 MB / one file / a handful of small
  // text fields is ample for year-one evidence (screenshots, PDFs); revisit
  // with the real object store.
  app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 16 },
  });

  const db = options.db ?? defaultDb;
  app.decorate("db", db);
  app.decorate("objectStore", options.objectStore ?? createInMemoryObjectStore());
  app.decorate("sourceArchiver", options.sourceArchiver ?? createFakeSourceArchiver());
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
  registerAnchorRoute(app);
  registerEvidenceRoutes(app);
  registerReviewRoutes(app);
  registerVersionVerificationRoute(app);
  registerDisputeRoutes(app);
  registerVerificationRoute(app);
  registerAdminRoutes(app);
  registerRegistrationRoutes(app);

  return app;
}
