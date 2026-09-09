import type { FastifyInstance } from "fastify";
import {
  evidenceSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  uploadEvidenceRequestSchema,
} from "@sourceit/shared";
import { createEvidenceRepository } from "../repositories/evidence.repository";
import { createPublishersRepository } from "../repositories/publishers.repository";
import { createAuthorization } from "../auth/can";
import { createEvidenceService } from "../services/evidence.service";
import { ValidationError } from "../errors";

// GET /versions/{versionId}/evidence  — public (EvidenceSection.tsx)
// POST /versions/{versionId}/evidence — authed, multipart/form-data (MediaEvidenceUpload.tsx)
export function registerEvidenceRoutes(app: FastifyInstance) {
  const repo = createEvidenceRepository(app.db);
  const publishersRepo = createPublishersRepository(app.db);
  const authz = createAuthorization(publishersRepo);
  const service = createEvidenceService(repo, authz, app.objectStore, app.sourceArchiver);

  app.get<{ Params: { versionId: string } }>(
    "/versions/:versionId/evidence",
    async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const result = await service.listEvidence(request.params.versionId, query.cursor, query.limit);
      return paginatedResponseSchema(evidenceSchema).parse(result);
    },
  );

  app.post<{ Params: { versionId: string } }>(
    "/versions/:versionId/evidence",
    { preHandler: app.requireActor },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new ValidationError("This endpoint expects multipart/form-data");
      }

      const fields: Record<string, string> = {};
      let file: { bytes: Uint8Array; contentType: string } | undefined;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          // Drain every file stream — an unconsumed one stalls the request.
          const buffer = await part.toBuffer();
          if (part.fieldname === "file" && !file) {
            file = { bytes: new Uint8Array(buffer), contentType: part.mimetype };
          }
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }

      const meta = uploadEvidenceRequestSchema.parse(fields);
      const created = await service.attachEvidence(request.actor!, request.params.versionId, {
        ...meta,
        file,
      });
      reply.status(201);
      return evidenceSchema.parse(created);
    },
  );
}
