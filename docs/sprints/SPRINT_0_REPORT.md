# Sprint 0 — Discovery
**Dates:** 2026-07-08 → 2026-07-08  ·  **Status:** Complete with carryover

## 1. Objective

Read every screen and component in the existing Figma Make frontend and produce the
discovery documents that Sprint 1 needs to design a database schema and API contract:
an entity/field inventory with citations, a screen-to-data map, a ranked list of
ambiguities the frontend doesn't resolve, and a proposal for the two stack fill-ins
(deployment target, auth provider) the build prompt left blank. No implementation code
was written, per the build prompt's ground rule that Phases 0 and 1 produce documents,
not features.

## 2. Changes from Previous Sprint

This is Sprint 0 — there is no previous sprint to diverge from. One thing worth
recording now because it shapes every sprint after this one: the frontend was found to
be considerably less complete than the build prompt's phrasing ("the frontend already
exists... every screen... describes something the backend must provide") suggested
going in. Several screens are static placeholders with no real data model behind them
(`ReviewerPortal.tsx`, `ReaderPortal.tsx`), two routes appear to be orphaned duplicates
never reached by normal navigation (`/simple-login`, `/reader-portal`), and an entire
invariant category from the build prompt — disputes, redaction/takedown, anchor
pending/failed states — has zero frontend representation to reverse-engineer from.
This isn't a correction of a prior decision (there was none), but it is an assumption
worth flagging early: the frontend is a strong spec for Publisher and Reader/Verifier
flows, and a weak-to-nonexistent spec for Reviewer flows and for most of the build
prompt's stated invariants. Sprint 1's contract will have to be designed from the build
prompt's invariants directly in those areas, confirmed by the user, rather than
inferred from UI.

## 3. Key Enhancements

None — this is a documentation-only sprint. No capability exists that didn't exist
before; the four documents produced are inputs to Sprint 1, not user-facing features.

## 4. Architecture Changes

None. The repository currently contains only the exported frontend
(`frontend/`), the build prompt itself, and the new `docs/` tree created this sprint:

```
docs/
├── DOMAIN.md
├── SCREENS.md
├── OPEN_QUESTIONS.md
├── STACK_PROPOSAL.md
├── PROJECT_STATE.md
└── sprints/
    └── SPRINT_0_REPORT.md
```

No dependency was added. No backend, database, or job runner exists yet.

## 5. Database Changes

None. No migration exists yet — Sprint 1 is where the schema is designed, and the
schema will be built against the entities in `docs/DOMAIN.md` plus whatever the answers
to `docs/OPEN_QUESTIONS.md` add or change.

## 6. New Components

None (code). Five documents were created:

- `docs/DOMAIN.md` — 13 entities with per-field type/nullability and file:line
  citations, plus a relationship summary.
- `docs/SCREENS.md` — every route mapped to what it reads and mutates, including a
  separate accounting of stubbed (toast-only) actions versus real navigation, and a
  note on unwired sidebar sections found during the read-through.
- `docs/OPEN_QUESTIONS.md` — 12 questions ranked by cost of getting wrong, from anchor
  state visibility (highest) down to dead-route cleanup (lowest).
- `docs/STACK_PROPOSAL.md` — proposes Railway for deployment and Clerk for auth, with
  reasoning, per the build prompt's two open fill-ins.
- `docs/PROJECT_STATE.md` — the living summary, written for the first time this sprint.

## 7. Sprint Test Results

No tests exist — no code was written this sprint, consistent with the build prompt's
"no implementation code until the contract is approved" rule. Total: 0 run, 0 passing,
0 failing, 0 skipped. Nothing to weaken.

## 8. Outcome

**Done:** the full frontend has been read (every file under `frontend/src/app/**` plus
both design-intent documents under `frontend/src/imports/pasted_text/`); the four
required Sprint 0 deliverables plus the stack proposal exist and are internally
consistent with each other and with the build prompt's invariants section.

**Not done, and deliberately so:** no schema, no Zod types, no OpenAPI document, no
seed script, no code of any kind — Sprint 1 is where that starts, and it is blocked on
the item below.

**Blocked on:** answers to the 12 questions in `docs/OPEN_QUESTIONS.md`, and a decision
(confirm or override) on the two proposals in `docs/STACK_PROPOSAL.md`. Per the build
prompt's ground rule 2 ("stop at every checkpoint... do not proceed to the next phase
on your own initiative"), Sprint 1 does not begin until these are answered.

**Known debt:** none incurred yet — nothing has been built. The debt to watch for once
Sprint 1 starts is designing the dispute/redaction/anchor-state schema from the build
prompt's prose alone in the areas where the frontend gave no signal (see Section 2
above) — that design will need explicit sign-off since there's no UI to validate it
against.

**What Sprint 1 should do first:** once the open questions are answered, start with the
per-asset hash chain and anchor-state tables, since nearly every other table (Evidence,
Review, Dispute) hangs off ArticleVersion, and the anchor state enum was the single
highest-ranked open question.
