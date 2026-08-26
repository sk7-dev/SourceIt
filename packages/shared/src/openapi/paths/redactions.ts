import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { errorEnvelopeSchema, uuidSchema } from "../../zod/common";
import { createRedactionRequestSchema, redactionSchema } from "../../zod/redactions";

const versionIdParam = z.object({ versionId: uuidSchema });

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/redaction",
  tags: ["Redactions"],
  summary: "The tombstone for this version, if redacted — public (resolves OPEN_QUESTIONS.md #5)",
  request: { params: versionIdParam },
  responses: {
    200: { description: "Redacted — tombstone follows", content: { "application/json": { schema: redactionSchema } } },
    404: { description: "Not redacted", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/versions/{versionId}/redaction",
  tags: ["Redactions"],
  summary:
    "Redact a version under legal takedown — admin only, redaction not deletion (build prompt invariant)",
  security: authed,
  request: {
    params: versionIdParam,
    body: { content: { "application/json": { schema: createRedactionRequestSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: redactionSchema } } },
    403: { description: "Not an admin", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
