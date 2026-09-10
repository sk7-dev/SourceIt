import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { errorEnvelopeSchema, paginatedResponseSchema, paginationQuerySchema, uuidSchema } from "../../zod/common";
import {
  createPublisherRequestSchema,
  credibilityBreakdownSchema,
  credibilityHistoryPointSchema,
  publisherAnalyticsSchema,
  publisherSchema,
  verifyPublisherRequestSchema,
} from "../../zod/publishers";
import { activityEventSchema } from "../../zod/activity";
import { articleVersionSummarySchema } from "../../zod/articles";
import { reviewSchema } from "../../zod/reviews";
import { disputeSchema } from "../../zod/disputes";

const publisherIdParam = z.object({ publisherId: uuidSchema });

registry.registerPath({
  method: "post",
  path: "/publishers",
  tags: ["Publishers"],
  summary: "Register a publisher organization (RegisterForm.tsx role=publisher)",
  security: authed,
  request: { body: { content: { "application/json": { schema: createPublisherRequestSchema } } } },
  responses: {
    201: { description: "Created, verificationStatus=unverified; caller added as an owner member", content: { "application/json": { schema: publisherSchema } } },
    400: { description: "Validation failure", content: { "application/json": { schema: errorEnvelopeSchema } } },
    401: { description: "No valid session", content: { "application/json": { schema: errorEnvelopeSchema } } },
    409: { description: "That email is already registered to a different account", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}",
  tags: ["Publishers"],
  summary: "Public publisher profile (PublisherProfileCard.tsx)",
  request: { params: publisherIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: publisherSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}/analytics",
  tags: ["Publishers"],
  summary: "Aggregate counts for the publisher dashboard (AnalyticsCards.tsx) — any authenticated account",
  security: authed,
  request: { params: publisherIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: publisherAnalyticsSchema } } },
    401: { description: "No session / no account", content: { "application/json": { schema: errorEnvelopeSchema } } },
    404: { description: "No such publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}/activity",
  tags: ["Publishers"],
  summary: "Recent activity feed (RecentActivity.tsx) — any authenticated account",
  security: authed,
  request: { params: publisherIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(activityEventSchema) } } },
    401: { description: "No session / no account", content: { "application/json": { schema: errorEnvelopeSchema } } },
    404: { description: "No such publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}/articles",
  tags: ["Publishers"],
  summary: "This publisher's articles, current version only (MyArticlesTable.tsx)",
  security: authed,
  request: { params: publisherIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(articleVersionSummarySchema) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}/reviews",
  tags: ["Publishers"],
  summary:
    "Reviews and disputes against this publisher's articles (ReviewsDisputes.tsx) — one chronological page across both, any authenticated account",
  security: authed,
  request: { params: publisherIdParam, query: paginationQuerySchema },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: paginatedResponseSchema(z.union([reviewSchema, disputeSchema])),
        },
      },
    },
    401: { description: "No session / no account", content: { "application/json": { schema: errorEnvelopeSchema } } },
    404: { description: "No such publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}/credibility",
  tags: ["Publishers"],
  summary: "Published credibility breakdown (CredibilityPanel.tsx) — public",
  request: { params: publisherIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: credibilityBreakdownSchema } } },
    404: { description: "No such publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/{publisherId}/credibility-history",
  tags: ["Publishers"],
  summary: "Credibility score trend (CredibilityPanel.tsx:84 sparkline) — public, newest first",
  request: { params: publisherIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(credibilityHistoryPointSchema) } } },
    404: { description: "No such publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/publishers/pending-verification",
  tags: ["Admin"],
  summary: "Publisher verification queue (resolves OPEN_QUESTIONS.md #8)",
  security: authed,
  request: { query: paginationQuerySchema },
  responses: {
    200: { description: "OK, admin only", content: { "application/json": { schema: paginatedResponseSchema(publisherSchema) } } },
    403: { description: "Not an admin", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/publishers/{publisherId}/verification",
  tags: ["Admin"],
  summary: "Approve or reject a publisher's verification (resolves OPEN_QUESTIONS.md #6a, #8)",
  security: authed,
  request: {
    params: publisherIdParam,
    body: { content: { "application/json": { schema: verifyPublisherRequestSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: publisherSchema } } },
    403: { description: "Not an admin", content: { "application/json": { schema: errorEnvelopeSchema } } },
    404: { description: "No such publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
