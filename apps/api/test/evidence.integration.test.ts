import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import { sha256Hex } from "@sourceit/anchoring";
import { startTestApp } from "./testApp";

// Build a multipart/form-data body by hand — no need to pull in `form-data`
// just for tests. `file` is optional (tag=source uploads no file).
function multipart(
  fields: Record<string, string>,
  file?: { name: string; filename: string; contentType: string; content: Buffer | string },
) {
  const boundary = `----sourceit${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("Evidence vertical slice", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;
  let ownerToken: string;
  let otherToken: string;
  let ownerPublisherId: string;

  beforeAll(async () => {
    ctx = await startTestApp();

    const [owner, other] = await ctx.db
      .insert(schema.accounts)
      .values([
        { clerkUserId: "clerk_ev_owner", email: "ev-owner@example.com", fullName: "Ev Owner", role: "publisher" },
        { clerkUserId: "clerk_ev_other", email: "ev-other@example.com", fullName: "Ev Other", role: "publisher" },
      ])
      .returning();
    ownerToken = owner!.clerkUserId;
    otherToken = other!.clerkUserId;

    const [ownerPublisher, otherPublisher] = await ctx.db
      .insert(schema.publishers)
      .values([
        {
          clerkOrgId: "org_ev_owner",
          organizationName: "Ev Owner Org",
          displayName: "Ev Owner Publisher",
          website: "https://ev-owner.example",
          description: "d",
          verificationStatus: "verified",
        },
        {
          clerkOrgId: "org_ev_other",
          organizationName: "Ev Other Org",
          displayName: "Ev Other Publisher",
          website: "https://ev-other.example",
          description: "d",
          verificationStatus: "verified",
        },
      ])
      .returning();
    ownerPublisherId = ownerPublisher!.id;

    await ctx.db.insert(schema.publisherMembers).values([
      { publisherId: ownerPublisherId, accountId: owner!.id, role: "owner" },
      { publisherId: otherPublisher!.id, accountId: other!.id, role: "owner" },
    ]);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function createDraft() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        publisherId: ownerPublisherId,
        category: "technology",
        headline: "Evidence Draft",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: false,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().version.id as string;
  }

  async function submitDraft(articleId: string, versionId: string) {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/articles/${articleId}/versions/${versionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        headline: "Evidence Draft",
        summary: "s",
        content: "c",
        authorName: "a",
        changeType: "original_published",
        submit: true,
      },
    });
    expect(res.statusCode).toBe(200);
  }

  function post(versionId: string, body: ReturnType<typeof multipart>, token = ownerToken) {
    return ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/evidence`,
      headers: { authorization: `Bearer ${token}`, "content-type": body.contentType },
      payload: body.payload,
    });
  }

  const fileFields = { fileType: "document", tag: "evidence", filename: "report.pdf", caption: "Q2 figures" };

  it("401s without an Authorization header", async () => {
    const versionId = await createDraft();
    const body = multipart(fileFields, {
      name: "file",
      filename: "report.pdf",
      contentType: "application/pdf",
      content: "bytes",
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/versions/${versionId}/evidence`,
      headers: { "content-type": body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("404s for an unknown version id", async () => {
    const res = await post(
      "00000000-0000-0000-0000-000000000000",
      multipart(fileFields, { name: "file", filename: "r.pdf", contentType: "application/pdf", content: "bytes" }),
    );
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("404s (not 403) when a non-member targets another publisher's draft — existence isn't leaked", async () => {
    const versionId = await createDraft();
    const res = await post(
      versionId,
      multipart(fileFields, { name: "file", filename: "r.pdf", contentType: "application/pdf", content: "bytes" }),
      otherToken,
    );
    expect(res.statusCode).toBe(404);
  });

  it("409s once the version is no longer a draft", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        publisherId: ownerPublisherId,
        category: "technology",
        headline: "Submitted",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: true,
      },
    });
    const versionId = create.json().version.id as string;

    const res = await post(
      versionId,
      multipart(fileFields, { name: "file", filename: "r.pdf", contentType: "application/pdf", content: "bytes" }),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "CONFLICT" });
  });

  it("400s when a required field is missing", async () => {
    const versionId = await createDraft();
    const { fileType: _drop, ...rest } = fileFields;
    const res = await post(
      versionId,
      multipart(rest, { name: "file", filename: "r.pdf", contentType: "application/pdf", content: "bytes" }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("400s when a non-source tag arrives with no file part", async () => {
    const versionId = await createDraft();
    const res = await post(versionId, multipart(fileFields));
    expect(res.statusCode).toBe(400);
    expect(res.json().details?.[0]?.field).toBe("file");
  });

  it("400s when tag=source arrives with no sourceUrl", async () => {
    const versionId = await createDraft();
    const res = await post(
      versionId,
      multipart({ fileType: "document", tag: "source", filename: "src.html" }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().details?.[0]?.field).toBe("sourceUrl");
  });

  it("201s for an uploaded file, hashing the bytes and echoing the metadata", async () => {
    const versionId = await createDraft();
    const bytes = Buffer.from("the actual evidence bytes");
    const res = await post(
      versionId,
      multipart(fileFields, { name: "file", filename: "report.pdf", contentType: "application/pdf", content: bytes }),
    );
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      articleVersionId: versionId,
      fileType: "document",
      tag: "evidence",
      filename: "report.pdf",
      caption: "Q2 figures",
      sourceUrl: null,
      isArchivedSnapshot: false,
    });
    expect(body.contentHash).toBe(await sha256Hex(new Uint8Array(bytes)));
  });

  it("201s for a tag=source item, archiving the URL instead of taking a file", async () => {
    const versionId = await createDraft();
    const sourceUrl = "https://example.org/primary-source";
    const res = await post(
      versionId,
      multipart({ fileType: "document", tag: "source", filename: "source.html", sourceUrl }),
    );
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ tag: "source", sourceUrl, isArchivedSnapshot: true });
    // The fake archiver is deterministic: snapshot bytes are `archived-snapshot:<url>`.
    expect(body.contentHash).toBe(await sha256Hex(`archived-snapshot:${sourceUrl}`));
  });

  it("lists a version's evidence once published, walking every row across cursor pages without overlap", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/articles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        publisherId: ownerPublisherId,
        category: "technology",
        headline: "Listable",
        summary: "s",
        content: "c",
        authorName: "a",
        submit: false,
      },
    });
    const articleId = create.json().article.id as string;
    const versionId = create.json().version.id as string;

    for (const filename of ["first.pdf", "second.pdf", "third.pdf"]) {
      const r = await post(
        versionId,
        multipart({ ...fileFields, filename }, { name: "file", filename, contentType: "application/pdf", content: filename }),
      );
      expect(r.statusCode).toBe(201);
    }
    await submitDraft(articleId, versionId);

    const page1 = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/evidence?limit=2` });
    expect(page1.statusCode).toBe(200);
    const b1 = page1.json();
    expect(b1.items).toHaveLength(2);
    expect(b1.nextCursor).toBeTypeOf("string");

    const page2 = await ctx.app.inject({
      method: "GET",
      url: `/versions/${versionId}/evidence?limit=2&cursor=${encodeURIComponent(b1.nextCursor)}`,
    });
    const b2 = page2.json();
    expect(b2.items).toHaveLength(1);
    expect(b2.nextCursor).toBeNull();

    const seen = [...b1.items, ...b2.items].map((e: { filename: string }) => e.filename);
    expect(new Set(seen)).toEqual(new Set(["first.pdf", "second.pdf", "third.pdf"]));
  });

  it("404s a public evidence listing for a draft version", async () => {
    const versionId = await createDraft();
    await post(
      versionId,
      multipart(fileFields, { name: "file", filename: "r.pdf", contentType: "application/pdf", content: "x" }),
    );
    const res = await ctx.app.inject({ method: "GET", url: `/versions/${versionId}/evidence` });
    expect(res.statusCode).toBe(404);
  });

  it("404s a public evidence listing for an unknown version", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/versions/00000000-0000-0000-0000-000000000000/evidence",
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects UPDATE against the evidence table (append-only invariant)", async () => {
    const versionId = await createDraft();
    const created = await post(
      versionId,
      multipart(fileFields, { name: "file", filename: "r.pdf", contentType: "application/pdf", content: "y" }),
    );
    const evidenceId = created.json().id as string;

    await expect(
      ctx.db.update(schema.evidence).set({ caption: "tampered" }).where(eq(schema.evidence.id, evidenceId)),
    ).rejects.toThrow(/append-only/);
  });
});
