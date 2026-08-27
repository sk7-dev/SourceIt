import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sourceit/shared";
import { startTestApp } from "./testApp";

describe("GET /me", () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>;

  beforeAll(async () => {
    ctx = await startTestApp();
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("401s with no Authorization header (unauthenticated)", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("404s for a verified session with no matching account row (not-found)", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer clerk_no_such_user" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("200s with the account, publisherIds, and reviewerId for a real session (happy path)", async () => {
    const [account] = await ctx.db
      .insert(schema.accounts)
      .values({
        clerkUserId: "clerk_happy_path_user",
        email: "happy@example.com",
        fullName: "Happy Path",
        role: "reader",
      })
      .returning();

    const res = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${account!.clerkUserId}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      account: {
        id: account!.id,
        email: "happy@example.com",
        fullName: "Happy Path",
        role: "reader",
        createdAt: account!.createdAt.toISOString(),
      },
      publisherIds: [],
      reviewerId: null,
    });
  });
});
