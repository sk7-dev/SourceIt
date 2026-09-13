import { z } from "../../zod/z";
import { registry, authed } from "../registry";
import { paginatedResponseSchema, paginationQuerySchema, uuidSchema, errorEnvelopeSchema } from "../../zod/common";
import { evidenceSchema, uploadEvidenceRequestSchema } from "../../zod/evidence";

const versionIdParam = z.object({ versionId: uuidSchema });
const fileParam = z.object({ versionId: uuidSchema, evidenceId: uuidSchema });

// multipart/form-data body: the non-file fields of uploadEvidenceRequestSchema
// plus an optional binary `file` part (present for every tag except `source`,
// which archives `sourceUrl` server-side instead). See docs/sprints/SPRINT_5_REPORT.md
// for why this replaced the Sprint 1 application/json shape.
const uploadEvidenceMultipartSchema = uploadEvidenceRequestSchema
  .extend({
    file: z.string().openapi({ type: "string", format: "binary" }).optional(),
  })
  .openapi("UploadEvidenceMultipart");

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/evidence",
  tags: ["Evidence"],
  summary: "Evidence attached to this version (EvidenceSection.tsx)",
  request: { params: versionIdParam, query: paginationQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginatedResponseSchema(evidenceSchema) } } },
    404: { description: "No such published version (unknown, or still a draft)", content: { "application/json": { schema: errorEnvelopeSchema } } },
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
    body: { content: { "multipart/form-data": { schema: uploadEvidenceMultipartSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: evidenceSchema } } },
    400: { description: "Missing file part for a non-source tag, or malformed fields", content: { "application/json": { schema: errorEnvelopeSchema } } },
    404: { description: "No such version, or the caller may not write its draft", content: { "application/json": { schema: errorEnvelopeSchema } } },
    409: { description: "Version is no longer a draft — evidence binds while drafting and is then append-only", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/versions/{versionId}/evidence/{evidenceId}/file",
  tags: ["Evidence"],
  summary:
    "Redirect to a short-lived signed URL for this evidence file (EvidenceSection.tsx 'View File'). Public, like the listing; the bucket itself is private and a fresh link is minted per call.",
  request: { params: fileParam },
  responses: {
    302: { description: "Redirect to a signed URL, valid briefly" },
    404: { description: "No such published version, or no such evidence on it", content: { "application/json": { schema: errorEnvelopeSchema } } },
  },
});
