import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { paginatedResponseSchema, paginationQuerySchema, uuidSchema, errorEnvelopeSchema } from "../../zod/common";
import { evidenceSchema, uploadEvidenceRequestSchema } from "../../zod/evidence";

const versionIdParam = z.object({ versionId: uuidSchema });

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/evidence",
  tags: ["Evidence"],
  summary: "Evidence attached to this version (EvidenceSection.tsx)",
  request: { params: versionIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(evidenceSchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/versions/{versionId}/evidence",
  tags: ["Evidence"],
  summary: "Attach evidence to a draft version (MediaEvidenceUpload.tsx)",
  security: authed,
  request: {
    params: versionIdParam,
    body: { content: { "application/json": { schema: uploadEvidenceRequestSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: evidenceSchema } } },
    409: { description: "Version is no longer a draft — evidence binds at submission and is then append-only", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
