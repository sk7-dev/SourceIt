import type { FastifyInstance } from "fastify";

// Cross-cutting standard: structured JSON, one request ID threaded through
// every log line (Fastify's built-in logger + genReqId in app.ts already do
// this), plus a request log line at completion with method, route pattern,
// status, and duration.
export function registerRequestLogging(app: FastifyInstance) {
  app.addHook("onResponse", (request, reply, done) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      "request completed",
    );
    done();
  });
}
