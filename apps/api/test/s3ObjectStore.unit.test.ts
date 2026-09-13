import { describe, expect, it, vi } from "vitest";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3ObjectStore } from "../src/storage/s3ObjectStore";

// Dummy, non-functional credentials — enough to construct a client and sign a
// request locally; no network call is ever made in this file.
const CONFIG = {
  bucket: "sourceit-evidence-test",
  region: "auto",
  accessKeyId: "AKIAFAKE",
  secretAccessKey: "fakesecret",
  endpoint: "https://fake.r2.cloudflarestorage.com",
  forcePathStyle: true,
};

describe("createS3ObjectStore", () => {
  it("getSignedUrl signs locally — no network call — and embeds the bucket + key", async () => {
    const store = createS3ObjectStore(CONFIG);
    const url = await store.getSignedUrl("evidence/abc123");

    const parsed = new URL(url);
    expect(parsed.pathname).toContain(CONFIG.bucket);
    expect(parsed.pathname).toContain("evidence/abc123");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("900");
  });

  it("respects a configured signed-URL expiry", async () => {
    const store = createS3ObjectStore({ ...CONFIG, signedUrlExpirySeconds: 60 });
    const url = await store.getSignedUrl("evidence/abc123");
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("put skips the upload when the key already exists (idempotent on content-addressed key)", async () => {
    const client = new S3Client({ region: CONFIG.region, endpoint: CONFIG.endpoint, forcePathStyle: true, credentials: CONFIG });
    const send = vi.spyOn(client, "send").mockImplementation(async (cmd) => {
      if (cmd instanceof HeadObjectCommand) return {} as never; // exists
      throw new Error(`unexpected command: ${cmd.constructor.name}`);
    });
    const store = createS3ObjectStore(CONFIG, client);

    await store.put("evidence/exists", new Uint8Array([1, 2, 3]), "application/pdf");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("put uploads when the key is new", async () => {
    const client = new S3Client({ region: CONFIG.region, endpoint: CONFIG.endpoint, forcePathStyle: true, credentials: CONFIG });
    const send = vi.spyOn(client, "send").mockImplementation(async (cmd) => {
      if (cmd instanceof HeadObjectCommand) {
        const err = new Error("not found");
        err.name = "NotFound";
        throw err;
      }
      if (cmd instanceof PutObjectCommand) return {} as never;
      throw new Error(`unexpected command: ${cmd.constructor.name}`);
    });
    const store = createS3ObjectStore(CONFIG, client);

    await store.put("evidence/new", new Uint8Array([1, 2, 3]), "application/pdf");

    expect(send).toHaveBeenCalledTimes(2);
    const putCall = send.mock.calls[1]![0] as PutObjectCommand;
    expect(putCall).toBeInstanceOf(PutObjectCommand);
    expect(putCall.input).toMatchObject({
      Bucket: CONFIG.bucket,
      Key: "evidence/new",
      ContentType: "application/pdf",
    });
  });

  it("get returns the bytes and content type for an existing key", async () => {
    const client = new S3Client({ region: CONFIG.region, endpoint: CONFIG.endpoint, forcePathStyle: true, credentials: CONFIG });
    const bytes = new Uint8Array([9, 9, 9]);
    vi.spyOn(client, "send").mockImplementation(async (cmd) => {
      if (cmd instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => bytes }, ContentType: "image/png" } as never;
      }
      throw new Error("unexpected command");
    });
    const store = createS3ObjectStore(CONFIG, client);

    const result = await store.get("evidence/found");
    expect(result).toEqual({ bytes, contentType: "image/png" });
  });

  it("get returns null for a missing key", async () => {
    const client = new S3Client({ region: CONFIG.region, endpoint: CONFIG.endpoint, forcePathStyle: true, credentials: CONFIG });
    vi.spyOn(client, "send").mockImplementation(async () => {
      const err = new Error("no such key");
      err.name = "NoSuchKey";
      throw err;
    });
    const store = createS3ObjectStore(CONFIG, client);

    expect(await store.get("evidence/missing")).toBeNull();
  });
});
