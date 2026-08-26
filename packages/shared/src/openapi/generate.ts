import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";

// Side-effect imports: each registers its paths against `registry`.
import "./paths/session";
import "./paths/publishers";
import "./paths/reviewers";
import "./paths/articles";
import "./paths/evidence";
import "./paths/reviews";
import "./paths/disputes";
import "./paths/redactions";
import "./paths/anchoring";
import "./paths/reader";

const generator = new OpenApiGeneratorV31(registry.definitions);

const document = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "SourceIt API",
    version: "0.1.0",
    description:
      "Generated from packages/shared/src/zod — not hand-written. See docs/PROJECT_STATE.md for what is and isn't implemented yet.",
  },
  servers: [{ url: "/api" }],
});

const outPath = resolve(import.meta.dirname, "../../openapi.json");
writeFileSync(outPath, JSON.stringify(document, null, 2) + "\n");
console.log(`wrote ${outPath}`);
