**Confirmed 2026-08-26** (Sprint 1): both proposals below — Railway and Clerk — were
accepted as proposed, no override. See `docs/PROJECT_STATE.md` Decisions log.

# SourceIt — Stack Proposal (Sprint 0)

Two fill-ins from the build prompt were left blank and need a decision before Sprint 1
can design migrations or the auth flow. Both are proposed here with reasoning, per
Section 1/3's instruction to propose in Phase 0 if there's no strong existing
preference. Everything else in Section 3 (TypeScript/Node 22, Fastify, Postgres 16,
Drizzle, Zod, OpenAPI 3.1, Vitest, pnpm workspace) is accepted as specified — no
deviation proposed there.

## Deployment target: Railway

**Proposal: Railway**, with Fly.io as the documented fallback if regional control or
finer machine-level scaling becomes necessary later.

Reasoning:
- The runtime shape is a Fastify monolith plus one durable background worker (the
  anchoring batch job) plus Postgres plus object storage — no exotic infra, matching
  the build prompt's "prefer boring" rule and the "modest volume, year one" scale
  assumption.
- Railway runs the web service and the worker as two services from the same repo with
  minimal config, includes a managed Postgres with simple backup/restore, and needs
  close to zero DevOps investment for a team this size — appropriate when "the hard
  problems are correctness and immutability, not throughput" (build prompt, Scale
  section).
- Fly.io is a reasonable second choice (better regional/edge control, Fly Postgres,
  persistent volumes) but carries more operational surface (machine config, volumes,
  regions) than this stage of the project needs.
- AWS ECS is rejected for now: its ops overhead (task definitions, ALB, VPC, IAM) is
  disproportionate to low-thousands-of-publishers scale and works against "prefer
  boring."
- Vercel + Neon is rejected: Vercel's serverless function model is a poor fit for the
  durable, crash-safe, idempotent background job runner the anchoring batch process
  requires (build prompt, Background work section) — a long-running or resumable
  worker process doesn't map cleanly onto Vercel functions, and we'd end up hosting the
  worker somewhere else anyway, splitting the deployment for no benefit.
- Nothing about this app is Railway-specific (it's a plain Node process + Postgres +
  S3-compatible storage), so migrating to Fly or ECS later, if scale ever demands it,
  is a redeploy, not a rewrite.

## Auth: Clerk

**Proposal: Clerk.**

Reasoning:
- SourceIt has two account types that need real auth (Publisher org members, Reviewers)
  plus a third that needs none (public reads, per the "reads are public and
  unauthenticated" invariant) — Clerk's Organizations feature maps directly onto
  "Publisher (org) with member users" without us building membership/invitation
  plumbing ourselves.
- The build prompt flags institutional SSO as "likely later" — Clerk supports SSO
  connections as a config addition on an existing org, so this doesn't require a
  migration when it comes up.
- Self-rolled JWT + argon2 is the most "boring"/dependency-free option and was
  seriously considered, but the build prompt's own ground rules ("be careful not to
  introduce security vulnerabilities," "prioritize safe, secure, and correct code") cut
  against hand-rolling session/password/reset flows for a project whose entire premise
  is trustworthiness — offloading credential storage and session handling to a vendor
  whose whole job is auth reduces the attack surface we're personally responsible for.
- Auth.js and Supabase Auth were considered; Clerk was preferred specifically for its
  built-in Organizations primitive, which is otherwise something we'd build by hand on
  either of those two.
- Cost at low-thousands-of-publishers scale is within Clerk's low tiers; this can be
  revisited if organization count grows far beyond the stated year-one scale.

**Stop and confirm:** both of these are proposals, not decisions — please confirm or
override before Sprint 1 designs the schema (org/membership tables) and the auth
middleware around whichever choice is finalized.
