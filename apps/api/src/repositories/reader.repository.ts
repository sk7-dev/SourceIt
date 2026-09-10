import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

// Saved articles and publisher follows for a reader account (Sprint 13). Both
// are simple per-account join tables with a (account_id, target) UNIQUE
// constraint. Lists keyset-paginate on the row `id` — same reasoning as
// evidence / reviews: a millisecond-truncated created_at cursor re-serves
// same-millisecond rows.
export function createReaderRepository(db: typeof Db) {
  // The current (highest-numbered) non-draft version of each of these articles,
  // with the owning publisher's name and verified flag — the shape the saved
  // list needs before the service overlays dispute / verification / redaction.
  async function currentVersionsForArticles(articleIds: string[]) {
    if (articleIds.length === 0) {
      return new Map<
        string,
        {
          versionId: string;
          versionMajor: number;
          versionMinor: number;
          reviewStatus: string;
          headline: string;
          publisherVerified: boolean;
        }
      >();
    }
    const rows = await db
      .select({
        articleId: schema.articleVersions.articleId,
        versionId: schema.articleVersions.id,
        versionMajor: schema.articleVersions.versionMajor,
        versionMinor: schema.articleVersions.versionMinor,
        reviewStatus: schema.articleVersions.reviewStatus,
        headline: schema.articleVersions.headline,
        verificationStatus: schema.publishers.verificationStatus,
      })
      .from(schema.articleVersions)
      .innerJoin(schema.articles, eq(schema.articleVersions.articleId, schema.articles.id))
      .innerJoin(schema.publishers, eq(schema.articles.publisherId, schema.publishers.id))
      .where(
        and(
          inArray(schema.articleVersions.articleId, articleIds),
          ne(schema.articleVersions.reviewStatus, "draft"),
        ),
      )
      .orderBy(desc(schema.articleVersions.versionMajor), desc(schema.articleVersions.versionMinor));

    const byArticle = new Map<
      string,
      { versionId: string; versionMajor: number; versionMinor: number; reviewStatus: string; headline: string; publisherVerified: boolean }
    >();
    for (const r of rows) {
      if (byArticle.has(r.articleId)) continue; // rows are version-desc; first wins
      byArticle.set(r.articleId, {
        versionId: r.versionId,
        versionMajor: r.versionMajor,
        versionMinor: r.versionMinor,
        reviewStatus: r.reviewStatus,
        headline: r.headline,
        publisherVerified: r.verificationStatus === "verified",
      });
    }
    return byArticle;
  }

  return {
    currentVersionsForArticles,

    // ---- saved articles ----

    async listSavedArticles(accountId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.savedArticles.id, cursor) : undefined;
      const rows = await db
        .select({
          id: schema.savedArticles.id,
          articleId: schema.savedArticles.articleId,
          savedAt: schema.savedArticles.createdAt,
          archivedAt: schema.articles.archivedAt,
          publisherName: schema.publishers.displayName,
        })
        .from(schema.savedArticles)
        .innerJoin(schema.articles, eq(schema.savedArticles.articleId, schema.articles.id))
        .innerJoin(schema.publishers, eq(schema.articles.publisherId, schema.publishers.id))
        .where(and(eq(schema.savedArticles.accountId, accountId), cursorFilter))
        .orderBy(asc(schema.savedArticles.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },

    async findSavedArticle(accountId: string, articleId: string) {
      const [row] = await db
        .select({ id: schema.savedArticles.id })
        .from(schema.savedArticles)
        .where(and(eq(schema.savedArticles.accountId, accountId), eq(schema.savedArticles.articleId, articleId)))
        .limit(1);
      return row ?? null;
    },

    async findSavedArticleById(savedArticleId: string) {
      const [row] = await db
        .select({
          id: schema.savedArticles.id,
          accountId: schema.savedArticles.accountId,
          articleId: schema.savedArticles.articleId,
          savedAt: schema.savedArticles.createdAt,
        })
        .from(schema.savedArticles)
        .where(eq(schema.savedArticles.id, savedArticleId))
        .limit(1);
      return row ?? null;
    },

    // The list-join shape for a single saved row — used to build the POST
    // response through the same denormalizer the list uses.
    async findSavedArticleForResponse(savedArticleId: string) {
      const [row] = await db
        .select({
          id: schema.savedArticles.id,
          articleId: schema.savedArticles.articleId,
          savedAt: schema.savedArticles.createdAt,
          archivedAt: schema.articles.archivedAt,
          publisherName: schema.publishers.displayName,
        })
        .from(schema.savedArticles)
        .innerJoin(schema.articles, eq(schema.savedArticles.articleId, schema.articles.id))
        .innerJoin(schema.publishers, eq(schema.articles.publisherId, schema.publishers.id))
        .where(eq(schema.savedArticles.id, savedArticleId))
        .limit(1);
      return row ?? null;
    },

    async createSavedArticle(accountId: string, articleId: string) {
      const [row] = await db
        .insert(schema.savedArticles)
        .values({ accountId, articleId })
        .returning({ id: schema.savedArticles.id, createdAt: schema.savedArticles.createdAt });
      return row!;
    },

    async deleteSavedArticle(savedArticleId: string) {
      await db.delete(schema.savedArticles).where(eq(schema.savedArticles.id, savedArticleId));
    },

    // ---- publisher follows ----

    async listFollows(accountId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.publisherFollows.id, cursor) : undefined;
      const rows = await db
        .select({
          id: schema.publisherFollows.id,
          publisherId: schema.publisherFollows.publisherId,
          createdAt: schema.publisherFollows.createdAt,
          publisherName: schema.publishers.displayName,
          verificationStatus: schema.publishers.verificationStatus,
        })
        .from(schema.publisherFollows)
        .innerJoin(schema.publishers, eq(schema.publisherFollows.publisherId, schema.publishers.id))
        .where(and(eq(schema.publisherFollows.accountId, accountId), cursorFilter))
        .orderBy(asc(schema.publisherFollows.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },

    async findFollow(accountId: string, publisherId: string) {
      const [row] = await db
        .select({ id: schema.publisherFollows.id })
        .from(schema.publisherFollows)
        .where(
          and(eq(schema.publisherFollows.accountId, accountId), eq(schema.publisherFollows.publisherId, publisherId)),
        )
        .limit(1);
      return row ?? null;
    },

    async findFollowById(followId: string) {
      const [row] = await db
        .select({
          id: schema.publisherFollows.id,
          accountId: schema.publisherFollows.accountId,
          publisherId: schema.publisherFollows.publisherId,
          createdAt: schema.publisherFollows.createdAt,
        })
        .from(schema.publisherFollows)
        .where(eq(schema.publisherFollows.id, followId))
        .limit(1);
      return row ?? null;
    },

    async createFollow(accountId: string, publisherId: string) {
      const [row] = await db
        .insert(schema.publisherFollows)
        .values({ accountId, publisherId })
        .returning({ id: schema.publisherFollows.id, createdAt: schema.publisherFollows.createdAt });
      return row!;
    },

    async deleteFollow(followId: string) {
      await db.delete(schema.publisherFollows).where(eq(schema.publisherFollows.id, followId));
    },

    async findArticleForSave(articleId: string) {
      const [row] = await db
        .select({ id: schema.articles.id, archivedAt: schema.articles.archivedAt })
        .from(schema.articles)
        .where(eq(schema.articles.id, articleId))
        .limit(1);
      return row ?? null;
    },

    async publisherExists(publisherId: string) {
      const [row] = await db
        .select({ id: schema.publishers.id, displayName: schema.publishers.displayName, verificationStatus: schema.publishers.verificationStatus })
        .from(schema.publishers)
        .where(eq(schema.publishers.id, publisherId))
        .limit(1);
      return row ?? null;
    },
  };
}
