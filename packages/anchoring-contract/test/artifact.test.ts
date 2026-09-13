import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import artifact from "../artifacts/Anchor.json" with { type: "json" };

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

// The compiled artifact is committed and consumed by the worker; these guards
// catch a contract edited without re-running `pnpm --filter
// @sourceit/anchoring-contract build`.
describe("Anchor.json artifact", () => {
  it("matches the current contract source", () => {
    const source = read("../contracts/Anchor.sol");
    const sha = createHash("sha256").update(source).digest("hex");
    expect(artifact.sourceSha256).toBe(sha);
  });

  it("exposes exactly the anchor() function, the Anchored event, and the AlreadyAnchored error", () => {
    const byKind = (t: string) => artifact.abi.filter((e) => e.type === t).map((e) => e.name);
    expect(byKind("function").sort()).toEqual(["anchor", "anchored"]);
    expect(byKind("event")).toEqual(["Anchored"]);
    expect(byKind("error")).toEqual(["AlreadyAnchored"]);

    const anchored = artifact.abi.find((e) => e.type === "event" && e.name === "Anchored");
    expect(anchored?.inputs?.find((i) => i.name === "root")?.indexed).toBe(true);
  });

  it("has 0x-prefixed deploy bytecode", () => {
    expect(artifact.bytecode).toMatch(/^0x[0-9a-f]+$/);
  });
});
