import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { paginatedResponseSchema, paginationQuerySchema, uuidSchema, errorEnvelopeSchema } from "../../zod/common";
import {
  disputeSchema,
  fileDisputeRequestSchema,
  resolveDisputeRequestSchema,
  respondToDisputeRequestSchema,
} from "../../zod/disputes";

const versionIdParam = z.object({ versionId: uuidSchema });
const disputeIdParam = z.object({ disputeId: uuidSchema });

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/disputes",
  tags: ["Disputes"],
  summary: "Disputes filed against this version — always visible, never suppressible (build prompt invariant)",
  request: { params: versionIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(disputeSchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/versions/{versionId}/disputes",
  tags: ["Disputes"],
  summary: "File a dispute (resolves OPEN_QUESTIONS.md #2)",
  security: authed,
  request: {
    params: versionIdParam,
    body: { content: { "application/json": { schema: fileDisputeRequestSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: disputeSchema } } },
    403: { description: "Reviewer is affiliated with this publisher, or not an approved reviewer", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/disputes/{disputeId}",
  tags: ["Disputes"],
  summary: "One dispute with its full event history",
  request: { params: disputeIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: disputeSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/disputes/{disputeId}/respond",
  tags: ["Disputes"],
  summary:
    "Publisher response: free text, a correction (new ArticleVersion), or both — never deletion or suppression (resolves OPEN_QUESTIONS.md #2)",
  security: authed,
  request: {
    params: disputeIdParam,
    body: { content: { "application/json": { schema: respondToDisputeRequestSchema } } },
  },
  responses: {
    201: { description: "Event appended", content: { "application/json": { schema: disputeSchema } } },
    403: { description: "Not a member of the disputed publisher", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/disputes/{disputeId}/resolve",
  tags: ["Disputes"],
  summary:
    "Filer withdraws, or filer/admin marks resolved — never the publisher; SourceIt does not adjudicate truth, so this is procedural, not a verdict (build prompt invariant)",
  security: authed,
  request: {
    params: disputeIdParam,
    body: { content: { "application/json": { schema: resolveDisputeRequestSchema } } },
  },
  responses: {
    201: { description: "Event appended", content: { "application/json": { schema: disputeSchema } } },
    403: { description: "Not the filer and not an admin", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
