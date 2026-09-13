import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type { ObjectStore } from "./objectStore";

export interface S3ObjectStoreConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  // Set for an S3-compatible provider (Cloudflare R2, Backblaze B2, MinIO);
  // unset targets real AWS S3.
  endpoint?: string;
  // MinIO and some self-hosted S3-compatible servers need path-style URLs
  // (`endpoint/bucket/key` instead of `bucket.endpoint/key`); R2 and AWS S3
  // work with the default (virtual-hosted) style.
  forcePathStyle?: boolean;
  // How long a "View File" link stays valid. Default 900s (15 minutes) — long
  // enough to click through, short enough that a copied link doesn't linger.
  signedUrlExpirySeconds?: number;
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name;
  return name === "NoSuchKey" || name === "NotFound";
}

// The real backend behind ObjectStore — any S3-compatible provider (build
// prompt: "Object storage for evidence files, content-addressed by hash").
// Evidence is public once attached (build prompt: "evidence listings … open to
// anyone"), but the bucket itself stays private; readers reach a file only
// through a signed URL minted by GET /versions/{id}/evidence/{id}/file
// (Sprint 17), never a stable public link.
//
// `client` is an injectable seam for tests — `getSignedUrl` does its signing
// locally (no network call) so a real S3Client with dummy credentials is
// enough to test it directly; `put`/`get` call `client.send`, which tests stub.
export function createS3ObjectStore(
  config: S3ObjectStoreConfig,
  client: S3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }),
): ObjectStore {
  const expiresIn = config.signedUrlExpirySeconds ?? 900;

  return {
    async put(key, bytes, contentType) {
      // Idempotent on key (content-addressed) — skip the upload if the object
      // already exists rather than re-transferring identical bytes.
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return;
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },

    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const bytes = await res.Body!.transformToByteArray();
        return { bytes, contentType: res.ContentType ?? "application/octet-stream" };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async getSignedUrl(key) {
      return presign(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn,
      });
    },
  };
}
