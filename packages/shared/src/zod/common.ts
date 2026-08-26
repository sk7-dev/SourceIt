import { z } from "./z";

export const uuidSchema = z.string().uuid().openapi({ example: "b3f1c9a0-1e2d-4a3b-9c8f-6d5e4f3a2b1c" });

// UTC everywhere, no exceptions (build prompt Section 8).
export const isoDatetimeSchema = z.string().datetime({ offset: true }).openapi({
  example: "2026-04-15T14:30:00Z",
});

// Cross-cutting standard: every non-2xx response has this shape. The frontend
// switches on `code`, never on `message`.
export const errorEnvelopeSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  })
  .openapi("Error");

// Cross-cutting standard: cursor-based pagination, one convention for every list
// endpoint.
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
