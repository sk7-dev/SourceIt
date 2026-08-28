import { describe, expect, it } from "vitest";
import { canonicalStringify } from "../src/canonicalize";
import { hashVersionContent, type VersionContent } from "../src/hash";

function sample(overrides: Partial<VersionContent> = {}): VersionContent {
  return {
    headline: "City Council Approves Transit Budget",
    summary: "A new transit budget was approved in a 7-2 vote.",
    content: "The city council approved the new transit budget on Tuesday.",
    authorName: "Perry White",
    tags: ["transit", "budget"],
    sourceLinks: ["https://citycouncil.example/minutes/2026-04-15"],
    changeType: "original_published",
    changeSummary: null,
    ...overrides,
  };
}

describe("canonicalStringify", () => {
  it("is independent of object key insertion order", () => {
    const a = { z: 1, a: 2, m: { y: 1, b: 2 } };
    const b = { a: 2, m: { b: 2, y: 1 }, z: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it("preserves array order (arrays are content, not sorted)", () => {
    expect(canonicalStringify(["a", "b"])).not.toBe(canonicalStringify(["b", "a"]));
  });
});

describe("hashVersionContent", () => {
  it("is deterministic: same logical content always hashes the same", async () => {
    const h1 = await hashVersionContent(sample());
    const h2 = await hashVersionContent(sample());
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is independent of field insertion order", async () => {
    const ordered = sample();
    const reordered: VersionContent = {
      sourceLinks: ordered.sourceLinks,
      changeSummary: ordered.changeSummary,
      changeType: ordered.changeType,
      tags: ordered.tags,
      authorName: ordered.authorName,
      content: ordered.content,
      summary: ordered.summary,
      headline: ordered.headline,
    };
    expect(await hashVersionContent(reordered)).toBe(await hashVersionContent(ordered));
  });

  // One case per field — any change to any field must change the hash.
  it.each([
    ["headline", { headline: "A different headline" }],
    ["summary", { summary: "A different summary." }],
    ["content", { content: "Different body content entirely." }],
    ["authorName", { authorName: "Someone Else" }],
    ["tags", { tags: ["transit"] }],
    ["tags order", { tags: ["budget", "transit"] }],
    ["sourceLinks", { sourceLinks: [] }],
    ["changeType", { changeType: "major_update" }],
    ["changeSummary", { changeSummary: "Fixed a typo." }],
  ] satisfies Array<[string, Partial<VersionContent>]>)(
    "changing %s changes the hash",
    async (_label, overrides) => {
      const base = await hashVersionContent(sample());
      const changed = await hashVersionContent(sample(overrides));
      expect(changed).not.toBe(base);
    },
  );
});
