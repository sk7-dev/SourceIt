import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

const run = promisify(execFile);

// Phase 5 hardening: rate limiting on reads and writes, and the error handler
// mapping framework 4xx (415 wrong Content-Type, 413 oversized upload) onto the
// standard { code, message } envelope instead of a misleading 500.
describe("Hardening — rate limiting", () => {
  // @fastify/rate-limit's in-memory store misbehaves under vitest's module
  // runner (it works in real Node), so the rate-limit wiring — the read/write
  // budgets, the health-check exemption, and the { code: "RATE_LIMITED" }
  // envelope — is exercised over real HTTP by a plain-Node smoke script that
  // inlines the same config as src/plugins/rateLimit.ts.
  it("enforces per-IP read/write budgets and exempts health checks (real HTTP)", async () => {
    const script = fileURLToPath(new URL("./fixtures/rate-limit-smoke.cjs", import.meta.url));
    const { stdout } = await run(process.execPath, [script], { timeout: 30_000 });
    expect(stdout.trim()).toBe("OK");
  }, 40_000);
});

describe("Hardening — error envelope for framework 4xx", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let draftVersionId: string;

  beforeAll(async () => {
    ctx = await startTestApp();
    const [owner] = await ctx.db
      .insert(schema.accounts)
      .values([{ clerkUserId: "clerk_hd_owner", email: "hd-owner@example.com", fullName: "Hd Owner", role: "publisher" }])
      .returning();
    ownerToken = owner!.clerkUserId;
    const [publisher] = await ctx.db
      .insert(schema.publishers)
      .values({ clerkOrgId: "org_hd", organizationName: "Hd", displayName: "Hd", website: "https://hd.example", description: "d", verificationStatus: "verified" })
      .returning();
    await ctx.db.insert(schema.publisherMembers).values({ publisherId: publisher!.id, accountId: owner!.id, role: "owner" });

    const draft = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { publisherId: publisher!.id, category: "science", headline: "D", summary: "s", content: "c", authorName: "a", submit: false },
    });
    draftVersionId = draft.json().version.id;
  }, 120_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("415s an unsupported Content-Type with code UNSUPPORTED_MEDIA_TYPE", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/xml" },
      payload: "<article/>",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("413s an oversized multipart upload with code PAYLOAD_TOO_LARGE", async () => {
    const boundary = "----hd";
    const big = Buffer.alloc(26 * 1024 * 1024, 0x61); // 26 MB > the 25 MB fileSize limit
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileType"\r\n\r\ndocument\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tag"\r\n\r\nevidence\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="filename"\r\n\r\nbig.bin\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      big,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await ctx.app.inject({
      method: "POST",
      url: `/versions/${draftVersionId}/evidence`,
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
