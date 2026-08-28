import { and, desc, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import { schema } from "@sourceit/shared";
import type { db as Db } from "../db";

function versionLabel(major: number, minor: number): string {
  return `v${major}.${minor}`;
}

export function createArticlesRepository(db: typeof Db) {
  return {
    async createArticle(input: { publisherId: string; category: string }) {
      const [article] = await db
        .insert(schema.articles)
        .values({ publisherId: input.publisherId, category: input.category as never })
        .returning();
      return article!;
    },

    async findArticleById(articleId: string) {
      const [article] = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.id, articleId))
        .limit(1);
      return article ?? null;
    },

    async archiveArticle(articleId: string) {
      const [article] = await db
        .update(schema.articles)
        .set({ archivedAt: new Date() })
        .where(eq(schema.articles.id, articleId))
        .returning();
      return article ?? null;
    },

    async createVersion(input: {
      articleId: string;
      versionMajor: number;
      versionMinor: number;
      headline: string;
      summary: string;
      content: string;
      authorName: string;
      tags: string[] | null;
      sourceLinks: string[] | null;
      changeType: string;
      changeSummary: string | null;
      reviewStatus: "draft" | "pending_review";
      previousVersionId: string | null;
      contentHash: string | null;
      previousHash: string | null;
      publishedAt: Date | null;
    }) {
      const [version] = await db
        .insert(schema.articleVersions)
        .values({
          articleId: input.articleId,
          versionMajor: input.versionMajor,
          versionMinor: input.versionMinor,
          headline: input.headline,
          summary: input.summary,
          content: input.content,
          authorName: input.authorName,
          tags: input.tags,
          sourceLinks: input.sourceLinks,
          changeType: input.changeType as never,
          changeSummary: input.changeSummary,
          reviewStatus: input.reviewStatus,
          previousVersionId: input.previousVersionId,
          contentHash: input.contentHash,
          previousHash: input.previousHash,
          publishedAt: input.publishedAt,
        })
        .returning();
      return version!;
    },

    async findVersionById(versionId: string) {
      const [version] = await db
        .select()
        .from(schema.articleVersions)
        .where(eq(schema.articleVersions.id, versionId))
        .limit(1);
      return version ?? null;
    },

    // The most recent version overall (including drafts) — used by the
    // authenticated owner's views and to compute the next version number.
    async findLatestVersion(articleId: string) {
      const [version] = await db
        .select()
        .from(schema.articleVersions)
        .where(eq(schema.articleVersions.articleId, articleId))
        .orderBy(desc(schema.articleVersions.versionMajor), desc(schema.articleVersions.versionMinor))
        .limit(1);
      return version ?? null;
    },

    // The most recent *submitted* version — what a public reader sees as "the
    // article." Drafts are never shown to the public (build prompt: reads are
    // public, but a draft is, by definition, not yet published).
    async findLatestPublishedVersion(articleId: string) {
      const [version] = await db
        .select()
        .from(schema.articleVersions)
        .where(
          and(eq(schema.articleVersions.articleId, articleId), ne(schema.articleVersions.reviewStatus, "draft")),
        )
        .orderBy(desc(schema.articleVersions.versionMajor), desc(schema.articleVersions.versionMinor))
        .limit(1);
      return version ?? null;
    },

    // Public version history — excludes drafts, cursor-paginated on
    // (versionMajor, versionMinor) descending.
    async listPublishedVersions(articleId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? lt(schema.articleVersions.createdAt, new Date(cursor)) : undefined;
      const rows = await db
        .select()
        .from(schema.articleVersions)
        .where(
          and(
            eq(schema.articleVersions.articleId, articleId),
            ne(schema.articleVersions.reviewStatus, "draft"),
            cursorFilter,
          ),
        )
        .orderBy(desc(schema.articleVersions.createdAt))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.createdAt.toISOString() : null;
      return { items, nextCursor };
    },

    async updateDraftVersion(
      versionId: string,
      fields: Partial<{
        headline: string;
        summary: string;
        content: string;
        authorName: string;
        tags: string[] | null;
        sourceLinks: string[] | null;
        changeType: string;
        changeSummary: string | null;
      }>,
    ) {
      const [version] = await db
        .update(schema.articleVersions)
        .set(fields as never)
        .where(eq(schema.articleVersions.id, versionId))
        .returning();
      return version ?? null;
    },

    async deleteDraftVersion(versionId: string) {
      await db.delete(schema.articleVersions).where(eq(schema.articleVersions.id, versionId));
    },

    async createAnchorRecord(input: { articleVersionId: string; leafHash: string }) {
      await db.insert(schema.anchorRecords).values({
        articleVersionId: input.articleVersionId,
        leafHash: input.leafHash,
        status: "pending",
      });
    },

    async findAnchorRecordByVersionId(versionId: string) {
      const [record] = await db
        .select()
        .from(schema.anchorRecords)
        .where(eq(schema.anchorRecords.articleVersionId, versionId))
        .limit(1);
      return record ?? null;
    },

    // One page of this publisher's articles, each with its latest version
    // (draft or not — this is the owner's own view) and that version's anchor
    // status. Batch-loaded (3 queries total) rather than N+1 per article.
    async listForPublisher(publisherId: string, cursor: string | undefined, limit: number) {
      const cursorFilter = cursor ? gt(schema.articles.createdAt, new Date(cursor)) : undefined;
      const rows = await db
        .select()
        .from(schema.articles)
        .where(and(eq(schema.articles.publisherId, publisherId), isNull(schema.articles.archivedAt), cursorFilter))
        .orderBy(desc(schema.articles.createdAt))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null;

      if (page.length === 0) return { items: [], nextCursor: null };

      const articleIds = page.map((a) => a.id);
      const versionRows = await db
        .select()
        .from(schema.articleVersions)
        .where(inArray(schema.articleVersions.articleId, articleIds))
        .orderBy(desc(schema.articleVersions.versionMajor), desc(schema.articleVersions.versionMinor));

      const latestByArticle = new Map<string, (typeof versionRows)[number]>();
      for (const v of versionRows) {
        if (!latestByArticle.has(v.articleId)) latestByArticle.set(v.articleId, v);
      }

      const versionIds = [...latestByArticle.values()].map((v) => v.id);
      const anchorRows = versionIds.length
        ? await db.select().from(schema.anchorRecords).where(inArray(schema.anchorRecords.articleVersionId, versionIds))
        : [];
      const anchorByVersion = new Map(anchorRows.map((a) => [a.articleVersionId, a]));

      const items = page.map((article) => {
        const version = latestByArticle.get(article.id);
        const anchor = version ? anchorByVersion.get(version.id) : undefined;
        return {
          articleId: article.id,
          id: version?.id ?? article.id,
          category: article.category,
          versionLabel: version ? versionLabel(version.versionMajor, version.versionMinor) : versionLabel(0, 0),
          headline: version?.headline ?? "",
          reviewStatus: version?.reviewStatus ?? "draft",
          anchorStatus: anchor?.status ?? null,
          publishedAt: version?.publishedAt?.toISOString() ?? null,
        };
      });

      return { items, nextCursor };
    },
  };
}

export { versionLabel };
