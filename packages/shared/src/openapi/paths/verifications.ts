import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { uuidSchema, errorEnvelopeSchema } from "../../zod/common";
import { versionVerificationSchema } from "../../zod/verifications";

const versionIdParam = z.object({ versionId: uuidSchema });

registry.registerPath({
  method: "post",
  path: "/versions/{versionId}/verify",
  tags: ["Reviews"],
  summary:
    "Verify a published version — approved reviewer, no structural affiliation to the publisher (Sprint 11). Append-only; a version can be verified once.",
  security: authed,
  request: { params: versionIdParam },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: versionVerificationSchema } } },
    403: {
      description: "Reviewer is affiliated with this publisher, or not an approved reviewer",
      content: { "application/json": { schema: errorEnvelopeSchema } },
    },
    404: {
      description: "No such published version (unknown, or still a draft)",
      content: { "application/json": { schema: errorEnvelopeSchema } },
    },
    409: {
      description: "This version has already been verified",
      content: { "application/json": { schema: errorEnvelopeSchema } },
    },
  },
});
