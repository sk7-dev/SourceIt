import { sha256Hex } from "@sourceit/anchoring";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type { createEvidenceRepository } from "../repositories/evidence.repository";
import type { ObjectStore } from "../storage/objectStore";
import type { SourceArchiver } from "../storage/sourceArchiver";

type EvidenceRepo = ReturnType<typeof createEvidenceRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

export interface AttachEvidenceInput {
  fileType: "image" | "video" | "document";
  tag: "cover_image" | "media" | "evidence" | "source";
  filename: string;
  caption?: string;
  sourceUrl?: string;
  // The uploaded bytes, buffered from the multipart `file` part by the route.
  // Absent iff tag === "source" (which archives sourceUrl instead).
  file?: { bytes: Uint8Array; contentType: string };
}

export function toApiEvidence(row: {
  id: string;
  articleVersionId: string;
  fileType: string;
  tag: string;
  filename: string;
  caption: string | null;
  contentHash: string;
  sourceUrl: string | null;
  isArchivedSnapshot: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    articleVersionId: row.articleVersionId,
    fileType: row.fileType,
    tag: row.tag,
    filename: row.filename,
    caption: row.caption,
    contentHash: row.contentHash,
    sourceUrl: row.sourceUrl,
    isArchivedSnapshot: row.isArchivedSnapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createEvidenceService(
  repo: EvidenceRepo,
  authz: Authorization,
  store: ObjectStore,
  archiver: SourceArchiver,
) {
  return {
    // GET /versions/{versionId}/evidence — public, unauthenticated like every
    // read path. A draft version is not public: its evidence 404s (existence
    // not leaked), exactly as GET /articles/{id}/versions/{id} treats a draft.
    async listEvidence(versionId: string, cursor: string | undefined, limit: number) {
      const version = await repo.findVersionWithPublisher(versionId);
      if (!version || version.reviewStatus === "draft") {
        throw new NotFoundError("No such published version");
      }
      const { items, nextCursor } = await repo.listEvidence(versionId, cursor, limit);
      return { items: items.map(toApiEvidence), nextCursor };
    },

    // POST /versions/{versionId}/evidence — attach evidence while the version
    // is still a draft. Once it leaves draft the evidence set is frozen with it
    // (append-only: `evidence_append_only` trigger, build prompt invariant
    // "Evidence binds to a version, not an asset").
    async attachEvidence(actor: Actor, versionId: string, input: AttachEvidenceInput) {
      const version = await repo.findVersionWithPublisher(versionId);
      if (!version) throw new NotFoundError("Version not found");

      // A draft is invisible outside its own publisher — a non-member gets a
      // 404, not a 403, so the draft's existence isn't disclosed.
      const mayWrite = await authz.can(actor, {
        type: "evidence:attach",
        publisherId: version.publisherId,
      });
      if (!mayWrite) throw new NotFoundError("Version not found");

      if (version.reviewStatus !== "draft") {
        throw new ConflictError("Evidence can only be attached while the version is a draft");
      }

      let bytes: Uint8Array;
      let contentType: string;
      let sourceUrl: string | null = null;
      let isArchivedSnapshot = false;

      if (input.tag === "source") {
        if (!input.sourceUrl) {
          throw new ValidationError("A source evidence item needs a sourceUrl to archive", [
            { field: "sourceUrl", message: "required when tag is 'source'" },
          ]);
        }
        const archived = await archiver.archive(input.sourceUrl);
        bytes = archived.bytes;
        contentType = archived.contentType;
        sourceUrl = input.sourceUrl;
        isArchivedSnapshot = true;
      } else {
        if (!input.file) {
          throw new ValidationError("A file part is required for this evidence tag", [
            { field: "file", message: "required unless tag is 'source'" },
          ]);
        }
        bytes = input.file.bytes;
        contentType = input.file.contentType;
      }

      const contentHash = await sha256Hex(bytes);
      const storageKey = `evidence/${contentHash}`;
      await store.put(storageKey, bytes, contentType);

      const row = await repo.createEvidence({
        articleVersionId: versionId,
        fileType: input.fileType,
        tag: input.tag,
        filename: input.filename,
        caption: input.caption ?? null,
        contentHash,
        storageKey,
        sourceUrl,
        isArchivedSnapshot,
      });

      return toApiEvidence(row);
    },
  };
}
