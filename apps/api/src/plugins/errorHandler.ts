import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors";

function clientErrorCode(status: number): string {
  switch (status) {
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 415:
      return "UNSUPPORTED_MEDIA_TYPE";
    case 429:
      return "RATE_LIMITED";
    default:
      return "BAD_REQUEST";
  }
}

// A stable grouping key for an unexpected 5xx: the error's own code / name plus
// the first in-repo stack frame, so the same bug lands in the same bucket
// whatever log aggregator is wired up at deploy time.
function fingerprintOf(error: { code?: string; name?: string; stack?: string }): string {
  const kind = error.code ?? error.name ?? "Error";
  const frame = (error.stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ") && l.includes("/src/") && !l.includes("node_modules"));
  return frame ? `${kind} ${frame.replace(/^at\s+/, "").replace(/\s*\(.*\)$/, "")}` : kind;
}

// Cross-cutting standard: every non-2xx response has the same body shape —
// { code, message, details? }. HTTP status is set correctly *and* the code is
// in the body; the frontend switches on `code`, never `message`.
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Request failed validation",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    // Fastify's own schema-validation errors (route-level `schema` option)
    // arrive here too, with a `validation` array rather than a ZodError.
    if (error.validation) {
      reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Request failed validation",
        details: error.validation.map((v: { instancePath: string; message?: string; params?: Record<string, unknown> }) => ({
          field: v.instancePath || String(v.params?.["missingProperty"] ?? ""),
          message: v.message ?? "invalid",
        })),
      });
      return;
    }

    // Framework-level client errors carry their own 4xx status (a too-large
    // multipart upload → 413; a wrong/missing Content-Type → 415; the
    // rate limiter → 429). Map them onto the standard envelope instead of
    // letting them fall through to a misleading 500.
    const status = typeof error.statusCode === "number" ? error.statusCode : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      reply.status(status).send({
        code: clientErrorCode(status),
        message: error.message || "Request rejected",
      });
      return;
    }

    // Never leak internals — log the real error server-side with a stable
    // fingerprint for grouping, and return an opaque code to the caller.
    request.log.error(
      {
        err: error,
        reqId: request.id,
        method: request.method,
        route: request.routeOptions?.url ?? request.url,
        fingerprint: fingerprintOf(error),
      },
      "unhandled error",
    );
    reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: "NOT_FOUND",
      message: `No route matches ${request.method} ${request.url}`,
    });
  });
}
