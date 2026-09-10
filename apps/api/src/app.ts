import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { configureRateLimit } from "./plugins/rateLimit";
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
import { registerPublisherRoutes } from "./routes/publishers.route";
import { registerAnchorRoute } from "./routes/anchor.route";
import { registerEvidenceRoutes } from "./routes/evidence.route";
import { registerReviewRoutes } from "./routes/reviews.route";
import { registerVersionVerificationRoute } from "./routes/versionVerification.route";
import { registerRedactionRoutes } from "./routes/redactions.route";
import { registerDisputeRoutes } from "./routes/disputes.route";
import { registerVerificationRoute } from "./routes/verification.route";
import { registerAdminRoutes } from "./routes/admin.route";
import { registerRegistrationRoutes } from "./routes/registration.route";
import { registerReaderRoutes } from "./routes/reader.route";

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
  // Rate limiting (Phase 5). Defaults to the env-configured limits; pass
  // `false` to disable (the integration-test harness does, so a suite of
  // hundreds of `app.inject` calls from 127.0.0.1 doesn't trip it), or an
  // override for the dedicated rate-limit test.
  rateLimit?: false | { readMax?: number; writeMax?: number; windowMs?: number };
}


// The single place the app is assembled — used by src/server.ts to actually
// listen, and by test/testApp.ts to build the same app against a real Postgres
// with a fake session verifier (see src/auth/verifySession.ts for why). Async
// because the rate-limit plugin must be `await`ed before routes register.
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
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

  // Rate limiting (Phase 5). See src/plugins/rateLimit.ts. Awaited so its global
  // hook is attached before the route registrations below.
  if (options.rateLimit !== false) {
    await configureRateLimit(app, {
      readMax: options.rateLimit?.readMax ?? env.RATE_LIMIT_MAX,
      writeMax: options.rateLimit?.writeMax ?? env.RATE_LIMIT_WRITE_MAX,
      windowMs: options.rateLimit?.windowMs ?? env.RATE_LIMIT_WINDOW_MS,
    });
  }

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
  registerPublisherRoutes(app);
  registerAnchorRoute(app);
  registerEvidenceRoutes(app);
  registerReviewRoutes(app);
  registerVersionVerificationRoute(app);
  registerRedactionRoutes(app);
  registerDisputeRoutes(app);
  registerVerificationRoute(app);
  registerAdminRoutes(app);
  registerRegistrationRoutes(app);
  registerReaderRoutes(app);

  return app;
}
