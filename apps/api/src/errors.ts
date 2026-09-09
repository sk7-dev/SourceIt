// Cross-cutting standard: a stable machine `code` the frontend switches on,
// never `message`. Every handler that needs a non-2xx response throws one of
// these rather than replying inline, so the error envelope shape is enforced
// in exactly one place (src/plugins/errorHandler.ts).
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not permitted") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

// A 400 for a request that parsed structurally but is semantically invalid —
// e.g. a multipart evidence upload missing the file part. Shares the
// `VALIDATION_ERROR` code with the Zod path in src/plugins/errorHandler.ts so
// the frontend switches on one code for all bad-input cases.
export class ValidationError extends AppError {
  constructor(message: string, details?: Array<{ field: string; message: string }>) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}
