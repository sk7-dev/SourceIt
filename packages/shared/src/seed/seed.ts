import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { db, pool } from "../db/client";
import * as schema from "../db/schema";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// A realistic dataset: multiple orgs, multiple roles, edge cases (empty states,
// long strings, records at every status) — Sprint 1 deliverable per build prompt
// Section 6, Phase 1.
async function seed() {
  const [adminAccount, publisherOwnerA, publisherOwnerB, reviewerAccount1, reviewerAccount2, readerAccount] =
    await db
      .insert(schema.accounts)
      .values([
        { clerkUserId: `clerk_${randomUUID()}`, email: "admin@sourceit.example", fullName: "SourceIt Admin", role: "admin" },
        { clerkUserId: `clerk_${randomUUID()}`, email: "owner@dailyplanet.example", fullName: "Perry White", role: "publisher" },
        { clerkUserId: `clerk_${randomUUID()}`, email: "owner@unverified-times.example", fullName: "A. Newcomer", role: "publisher" },
        { clerkUserId: `clerk_${randomUUID()}`, email: "emily.chen@university.example", fullName: "Dr. Emily Chen", role: "reviewer" },
        { clerkUserId: `clerk_${randomUUID()}`, email: "pending.reviewer@example.com", fullName: "Jordan Pending", role: "reviewer" },
        { clerkUserId: `clerk_${randomUUID()}`, email: "reader@example.com", fullName: "Sam Reader", role: "reader" },
      ])
      .returning();

  // Two publishers: one fully verified with a rich history, one still
  // unverified — an edge case the frontend has never rendered (OPEN_QUESTIONS #6a).
  const [dailyPlanet, unverifiedTimes] = await db
    .insert(schema.publishers)
    .values([
      {
        clerkOrgId: `org_${randomUUID()}`,
        organizationName: "Daily Planet News Corp",
        displayName: "Daily Planet News",
        website: "https://dailyplanet.example",
        description: "Independent journalism covering politics, technology, and science.",
        categories: ["Politics", "Technology"],
        verificationStatus: "verified",
        verifiedAt: new Date(),
        verifiedByAccountId: adminAccount!.id,
        transparencyLevel: 4,
        credibilityScore: 84,
      },
      {
        clerkOrgId: `org_${randomUUID()}`,
        organizationName: "The Unverified Times",
        displayName: "The Unverified Times",
        website: "https://unverified-times.example",
        description: "A brand-new publisher awaiting verification.",
        categories: null,
        verificationStatus: "pending",
        transparencyLevel: 3,
        credibilityScore: 0,
      },
    ])
    .returning();

  await db.insert(schema.publisherMembers).values([
    { publisherId: dailyPlanet!.id, accountId: publisherOwnerA!.id, role: "owner" },
    { publisherId: unverifiedTimes!.id, accountId: publisherOwnerB!.id, role: "owner" },
  ]);

  await db.insert(schema.credibilityScoreHistory).values(
    [76, 78, 79, 80, 81, 82, 83, 84, 84].map((score, i) => ({
      publisherId: dailyPlanet!.id,
      score,
      recordedAt: new Date(Date.now() - (9 - i) * 3 * 24 * 3600 * 1000),
    })),
  );

  // Two reviewers: one approved (uses a pseudonym, per OPEN_QUESTIONS #10), one
  // still pending admin approval (OPEN_QUESTIONS #8 edge case).
  const [reviewerApproved, reviewerPending] = await db
    .insert(schema.reviewers)
    .values([
      {
        accountId: reviewerAccount1!.id,
        affiliation: "State University, Climate Science Department",
        expertise: "Climate Science, Political Science",
        applicationReason: "I want to help verify claims in my field of expertise.",
        title: "Climate Science Reviewer",
        pseudonym: "Dr. E. Chen",
        useLegalName: false,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedByAccountId: adminAccount!.id,
      },
      {
        accountId: reviewerAccount2!.id,
        affiliation: "Independent",
        expertise: "General fact-checking",
        applicationReason: "Long-time reader, want to contribute.",
        approvalStatus: "pending",
      },
    ])
    .returning();

  const [article] = await db
    .insert(schema.articles)
    .values([{ publisherId: dailyPlanet!.id, category: "technology" }])
    .returning();

  const v1Content = "The city council approved the new transit budget on Tuesday.";
  const v1Hash = sha256(v1Content);

  const [v1] = await db
    .insert(schema.articleVersions)
    .values([
      {
        articleId: article!.id,
        versionMajor: 1,
        versionMinor: 0,
        headline: "City Council Approves Transit Budget",
        summary: "A new transit budget was approved in a 7-2 vote.",
        content: v1Content,
        authorName: "Perry White",
        tags: ["transit", "budget", "local-government"],
        sourceLinks: ["https://citycouncil.example/minutes/2026-04-15"],
        changeType: "original_published",
        reviewStatus: "verified",
        contentHash: v1Hash,
        previousHash: null,
        publishedAt: new Date("2026-04-15T14:30:00Z"),
      },
    ])
    .returning();

  const v2Content = `${v1Content} An amendment added funding for two additional bus routes.`;
  const v2Hash = sha256(v2Content);

  const [v2] = await db
    .insert(schema.articleVersions)
    .values([
      {
        articleId: article!.id,
        versionMajor: 2,
        versionMinor: 0,
        headline: "City Council Approves Transit Budget",
        summary: "A new transit budget, later amended, was approved in a 7-2 vote.",
        content: v2Content,
        authorName: "Perry White",
        tags: ["transit", "budget", "local-government"],
        sourceLinks: ["https://citycouncil.example/minutes/2026-04-15", "https://citycouncil.example/amendments/22"],
        changeType: "major_update",
        changeSummary: "Added coverage of the bus-route funding amendment.",
        reviewStatus: "verified",
        previousVersionId: v1!.id,
        contentHash: v2Hash,
        previousHash: v1Hash,
        publishedAt: new Date("2026-05-02T09:00:00Z"),
      },
    ])
    .returning();

  // A never-submitted draft — the hard-deletable edge case (OPEN_QUESTIONS #9).
  await db.insert(schema.articleVersions).values([
    {
      articleId: article!.id,
      versionMajor: 3,
      versionMinor: 0,
      headline: "",
      summary: "",
      content: "Draft notes, not yet ready for review.",
      authorName: "Perry White",
      changeType: "minor_correction",
      reviewStatus: "draft",
    },
  ]);

  await db.insert(schema.anchorRecords).values([
    { articleVersionId: v1!.id, status: "anchored", leafHash: v1Hash, blockHeight: 1024, chainConfirmations: 42, anchoredAt: new Date("2026-04-15T14:35:00Z") },
    // Still in flight — the pending state the frontend has never rendered
    // (resolves OPEN_QUESTIONS #1).
    { articleVersionId: v2!.id, status: "pending", leafHash: v2Hash, chainConfirmations: 0 },
  ]);

  await db.insert(schema.evidence).values([
    { articleVersionId: v1!.id, fileType: "document", tag: "source", filename: "council-minutes-2026-04-15.pdf", contentHash: sha256("minutes-pdf-bytes"), storageKey: `evidence/${randomUUID()}.pdf`, sourceUrl: "https://citycouncil.example/minutes/2026-04-15", isArchivedSnapshot: true },
    { articleVersionId: v1!.id, fileType: "image", tag: "cover_image", filename: "council-chambers.jpg", contentHash: sha256("chambers-jpg-bytes"), storageKey: `evidence/${randomUUID()}.jpg` },
  ]);

  await db.insert(schema.reviews).values([
    { articleVersionId: v1!.id, reviewerId: reviewerApproved!.id, type: "confirmation", comment: "Verified against the public council minutes; figures match." },
  ]);

  // v1.0 verified through the real Sprint 11 mechanism — an approved reviewer
  // with no structural affiliation to The Daily Planet. (v2.0 is left
  // unverified: it carries an open dispute.)
  await db.insert(schema.versionVerifications).values([
    { articleVersionId: v1!.id, reviewerId: reviewerApproved!.id },
  ]);

  const [dispute] = await db
    .insert(schema.disputes)
    .values([
      {
        articleVersionId: v2!.id,
        filedByReviewerId: reviewerApproved!.id,
        reason: "The bus-route count in this version conflicts with the amendment text, which specifies three routes, not two.",
      },
    ])
    .returning();

  await db.insert(schema.disputeEvents).values([
    { disputeId: dispute!.id, eventType: "publisher_responded", note: "Confirmed with the council clerk; correcting to three routes.", actorAccountId: publisherOwnerA!.id },
  ]);

  await db.insert(schema.activityEvents).values([
    { publisherId: dailyPlanet!.id, type: "publish", title: "Published \"City Council Approves Transit Budget\"", articleId: article!.id, articleVersionId: v1!.id },
    { publisherId: dailyPlanet!.id, type: "blockchain", title: "Version 1.0 anchored on-chain", articleId: article!.id, articleVersionId: v1!.id },
    { publisherId: dailyPlanet!.id, type: "update", title: "Published a major update (v2.0)", articleId: article!.id, articleVersionId: v2!.id },
    { publisherId: dailyPlanet!.id, type: "dispute_filed", title: "Dr. E. Chen filed a dispute against v2.0", articleId: article!.id, articleVersionId: v2!.id },
    { publisherId: dailyPlanet!.id, type: "correction", title: "Responded to dispute with a correction commitment", articleId: article!.id, articleVersionId: v2!.id },
  ]);

  // A second Daily Planet article whose sole published version has been redacted
  // under a court order (Sprint 12) — the content is unservable on every public
  // read, but the tombstone (position, hash, timestamp, category) remains.
  const [redactedArticle] = await db
    .insert(schema.articles)
    .values([{ publisherId: dailyPlanet!.id, category: "politics" }])
    .returning();

  const redactedContent = "A report naming a local official in connection with a sealed investigation.";
  const redactedHash = sha256(redactedContent);

  const [redactedV1] = await db
    .insert(schema.articleVersions)
    .values([
      {
        articleId: redactedArticle!.id,
        versionMajor: 1,
        versionMinor: 0,
        headline: "Report on Sealed Investigation",
        summary: "Details of an ongoing investigation into a local official.",
        content: redactedContent,
        authorName: "Lois Lane",
        changeType: "original_published",
        reviewStatus: "pending_review",
        contentHash: redactedHash,
        previousHash: null,
        publishedAt: new Date("2026-06-01T12:00:00Z"),
      },
    ])
    .returning();

  await db.insert(schema.anchorRecords).values([
    { articleVersionId: redactedV1!.id, status: "anchored", leafHash: redactedHash, blockHeight: 2048, chainConfirmations: 30, anchoredAt: new Date("2026-06-01T12:05:00Z") },
  ]);

  await db.insert(schema.redactions).values([
    {
      articleVersionId: redactedV1!.id,
      category: "court_order",
      reason: "Superior Court order 2026-CV-1187 — publication enjoined pending the sealed proceeding.",
      tombstoneHash: redactedHash,
      redactedByAccountId: adminAccount!.id,
    },
  ]);

  await db.insert(schema.savedArticles).values([
    { accountId: readerAccount!.id, articleId: article!.id },
    // A saved article whose current version is redacted — the saved list blanks
    // the title (Sprint 13).
    { accountId: readerAccount!.id, articleId: redactedArticle!.id },
  ]);
  await db.insert(schema.publisherFollows).values([
    { accountId: readerAccount!.id, publisherId: dailyPlanet!.id },
    // Following an unverified publisher — `verified: false` in the follow list.
    { accountId: readerAccount!.id, publisherId: unverifiedTimes!.id },
  ]);

  // A credibility trend for the sparkline (CredibilityPanel.tsx). API-created
  // data gets these points from the Sprint 14 write hooks; the seed inserts a
  // short history directly.
  await db.insert(schema.credibilityScoreHistory).values(
    [72, 75, 74, 78, 81, 79].map((score, i) => ({
      publisherId: dailyPlanet!.id,
      score,
      recordedAt: new Date(2026, 3 + i, 15),
    })),
  );

  console.log("seed complete:", {
    accounts: 6,
    publishers: 2,
    reviewers: 2,
    articles: 2,
    versions: 4,
    versionVerifications: 1,
    redactions: 1,
    savedArticles: 2,
    publisherFollows: 2,
    credibilityHistoryPoints: 6,
    dispute: 1,
    reviewerPendingId: reviewerPending!.id,
  });
}

await seed();
await pool.end();
