import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { paginatedResponseSchema, paginationQuerySchema, uuidSchema, errorEnvelopeSchema } from "../../zod/common";
import { createReviewRequestSchema, retractReviewRequestSchema, reviewSchema } from "../../zod/reviews";

const versionIdParam = z.object({ versionId: uuidSchema });
const reviewIdParam = z.object({ reviewId: uuidSchema });

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/reviews",
  tags: ["Reviews"],
  summary: "Reviews attached to this version (ReviewerNotes.tsx)",
  request: { params: versionIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(reviewSchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/versions/{versionId}/reviews",
  tags: ["Reviews"],
  summary:
    "Attach a review — 403 if the reviewer is structurally affiliated with the publisher (resolves OPEN_QUESTIONS.md #4)",
  security: authed,
  request: {
    params: versionIdParam,
    body: { content: { "application/json": { schema: createReviewRequestSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: reviewSchema } } },
    403: { description: "Reviewer is affiliated with this publisher, or not an approved reviewer", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/reviews/{reviewId}/retract",
  tags: ["Reviews"],
  summary: "Retract own review — original text stays visible and intact (build prompt invariant)",
  security: authed,
  request: {
    params: reviewIdParam,
    body: { content: { "application/json": { schema: retractReviewRequestSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: reviewSchema } } },
    403: { description: "Not the reviewer who wrote it", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
