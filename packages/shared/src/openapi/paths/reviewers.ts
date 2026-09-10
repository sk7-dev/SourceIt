import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { errorEnvelopeSchema, paginatedResponseSchema, paginationQuerySchema, uuidSchema } from "../../zod/common";
import { applyAsReviewerRequestSchema, reviewerDecisionRequestSchema, reviewerSchema } from "../../zod/reviewers";

const reviewerIdParam = z.object({ reviewerId: uuidSchema });

registry.registerPath({
  method: "post",
  path: "/reviewers/apply",
  tags: ["Reviewers"],
  summary: "Apply to become a reviewer (RegisterForm.tsx role=reviewer)",
  security: authed,
  request: { body: { content: { "application/json": { schema: applyAsReviewerRequestSchema } } } },
  responses: {
    201: { description: "Created, approvalStatus=pending", content: { "application/json": { schema: reviewerSchema } } },
    400: { description: "Validation failure", content: { "application/json": { schema: errorEnvelopeSchema } } },
    401: { description: "No valid session", content: { "application/json": { schema: errorEnvelopeSchema } } },
    409: { description: "This account has already applied to be a reviewer, or the email is registered to a different account", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/reviewers/pending",
  tags: ["Admin"],
  summary: "Reviewer approval queue (resolves OPEN_QUESTIONS.md #8)",
  security: authed,
  request: { query: paginationQuerySchema },
  responses: {
    200: { description: "OK, admin only", content: { "application/json": { schema: paginatedResponseSchema(reviewerSchema) } } },
    403: { description: "Not an admin", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/reviewers/{reviewerId}/decision",
  tags: ["Admin"],
  summary: "Approve or reject a reviewer application",
  security: authed,
  request: {
    params: reviewerIdParam,
    body: { content: { "application/json": { schema: reviewerDecisionRequestSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: reviewerSchema } } },
    403: { description: "Not an admin", content: { "application/json": { schema: errorEnvelopeSchema } } },
    404: { description: "No such reviewer", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
