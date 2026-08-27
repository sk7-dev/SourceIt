import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors";

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

    // Never leak internals — log the real error server-side, return a stable
    // opaque code to the caller.
    request.log.error({ err: error }, "unhandled error");
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
