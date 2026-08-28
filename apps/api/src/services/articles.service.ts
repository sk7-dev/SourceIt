import { hashVersionContent } from "@sourceit/anchoring";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { Actor, createAuthorization } from "../auth/can";
import type { createArticlesRepository } from "../repositories/articles.repository";
import { versionLabel } from "../repositories/articles.repository";

type ArticlesRepo = ReturnType<typeof createArticlesRepository>;
type Authorization = ReturnType<typeof createAuthorization>;

export interface CreateArticleInput {
  publisherId: string;
  category: string;
  headline: string;
  summary: string;
  content: string;
  authorName: string;
  tags?: string[];
  sourceLinks?: string[];
  submit: boolean;
}

export interface CreateVersionInput {
  headline: string;
  summary: string;
  content: string;
  authorName: string;
  tags?: string[];
  sourceLinks?: string[];
  changeType: string;
  changeSummary?: string;
  submit: boolean;
}

function toApiVersion(version: {
  id: string;
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
  reviewStatus: string;
  previousVersionId: string | null;
  contentHash: string | null;
  previousHash: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}) {
  return {
    id: version.id,
    articleId: version.articleId,
    versionMajor: version.versionMajor,
    versionMinor: version.versionMinor,
    versionLabel: versionLabel(version.versionMajor, version.versionMinor),
    headline: version.headline,
    summary: version.summary,
    content: version.content,
    authorName: version.authorName,
    tags: version.tags,
    sourceLinks: version.sourceLinks,
    changeType: version.changeType,
    changeSummary: version.changeSummary,
    reviewStatus: version.reviewStatus,
    previousVersionId: version.previousVersionId,
    contentHash: version.contentHash,
    previousHash: version.previousHash,
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toApiArticle(article: { id: string; publisherId: string; category: string; createdAt: Date }) {
  return {
    id: article.id,
    publisherId: article.publisherId,
    category: article.category,
    createdAt: article.createdAt.toISOString(),
  };
}

export function createArticlesService(repo: ArticlesRepo, authz: Authorization) {
  return {
    async createArticle(actor: Actor, input: CreateArticleInput) {
      await authz.assertCan(actor, { type: "article:createDraft", publisherId: input.publisherId });
      if (input.submit) {
        await authz.assertCan(actor, { type: "article:submit", publisherId: input.publisherId });
      }

      const article = await repo.createArticle({ publisherId: input.publisherId, category: input.category });

      const tags = input.tags ?? [];
      const sourceLinks = input.sourceLinks ?? [];
      const contentHash = input.submit
        ? await hashVersionContent({
            headline: input.headline,
            summary: input.summary,
            content: input.content,
            authorName: input.authorName,
            tags,
            sourceLinks,
            changeType: "original_published",
            changeSummary: null,
          })
        : null;

      const version = await repo.createVersion({
        articleId: article.id,
        versionMajor: 1,
        versionMinor: 0,
        headline: input.headline,
        summary: input.summary,
        content: input.content,
        authorName: input.authorName,
        tags,
        sourceLinks,
        changeType: "original_published",
        changeSummary: null,
        reviewStatus: input.submit ? "pending_review" : "draft",
        previousVersionId: null,
        contentHash,
        previousHash: null,
        publishedAt: input.submit ? new Date() : null,
      });

      if (input.submit && contentHash) {
        await repo.createAnchorRecord({ articleVersionId: version.id, leafHash: contentHash });
      }

      return { article: toApiArticle(article), version: toApiVersion(version) };
    },

    async getArticle(articleId: string) {
      const article = await repo.findArticleById(articleId);
      if (!article || article.archivedAt) throw new NotFoundError("Article not found");
      return toApiArticle(article);
    },

    async listPublishedVersions(articleId: string, cursor: string | undefined, limit: number) {
      const article = await repo.findArticleById(articleId);
      if (!article || article.archivedAt) throw new NotFoundError("Article not found");
      const { items, nextCursor } = await repo.listPublishedVersions(articleId, cursor, limit);
      return { items: items.map(toApiVersion), nextCursor };
    },

    async getVersion(articleId: string, versionId: string, actor: Actor | null) {
      const version = await repo.findVersionById(versionId);
      if (!version || version.articleId !== articleId) throw new NotFoundError("Version not found");

      if (version.reviewStatus === "draft") {
        const article = await repo.findArticleById(articleId);
        if (!article) throw new NotFoundError("Version not found");
        if (!actor || !(await authz.can(actor, { type: "article:writeDraft", publisherId: article.publisherId }))) {
          // A draft doesn't exist, as far as anyone outside its own publisher
          // is concerned — 404, not 403, so its existence isn't leaked.
          throw new NotFoundError("Version not found");
        }
      }

      return toApiVersion(version);
    },

    async createVersion(actor: Actor, articleId: string, input: CreateVersionInput) {
      const article = await repo.findArticleById(articleId);
      if (!article || article.archivedAt) throw new NotFoundError("Article not found");

      await authz.assertCan(actor, { type: "article:writeDraft", publisherId: article.publisherId });
      if (input.submit) {
        await authz.assertCan(actor, { type: "article:submit", publisherId: article.publisherId });
      }

      if (input.changeType === "original_published") {
        throw new ConflictError("original_published is only valid for a new article's first version");
      }

      const latestPublished = await repo.findLatestPublishedVersion(articleId);
      if (!latestPublished) {
        throw new ConflictError("This article has no published version yet — submit its first version before correcting it");
      }

      const versionMajor =
        input.changeType === "major_update" ? latestPublished.versionMajor + 1 : latestPublished.versionMajor;
      const versionMinor =
        input.changeType === "major_update" ? 0 : latestPublished.versionMinor + 1;

      const tags = input.tags ?? [];
      const sourceLinks = input.sourceLinks ?? [];
      const contentHash = input.submit
        ? await hashVersionContent({
            headline: input.headline,
            summary: input.summary,
            content: input.content,
            authorName: input.authorName,
            tags,
            sourceLinks,
            changeType: input.changeType,
            changeSummary: input.changeSummary ?? null,
          })
        : null;

      const version = await repo.createVersion({
        articleId,
        versionMajor,
        versionMinor,
        headline: input.headline,
        summary: input.summary,
        content: input.content,
        authorName: input.authorName,
        tags,
        sourceLinks,
        changeType: input.changeType,
        changeSummary: input.changeSummary ?? null,
        reviewStatus: input.submit ? "pending_review" : "draft",
        previousVersionId: latestPublished.id,
        contentHash,
        previousHash: latestPublished.contentHash,
        publishedAt: input.submit ? new Date() : null,
      });

      if (input.submit && contentHash) {
        await repo.createAnchorRecord({ articleVersionId: version.id, leafHash: contentHash });
      }

      return toApiVersion(version);
    },

    async updateDraftVersion(actor: Actor, articleId: string, versionId: string, input: CreateVersionInput) {
      const article = await repo.findArticleById(articleId);
      if (!article) throw new NotFoundError("Article not found");
      await authz.assertCan(actor, { type: "article:writeDraft", publisherId: article.publisherId });

      const existing = await repo.findVersionById(versionId);
      if (!existing || existing.articleId !== articleId) throw new NotFoundError("Version not found");
      if (existing.reviewStatus !== "draft") {
        throw new ConflictError("Only a draft version can be edited");
      }

      if (input.submit) {
        await authz.assertCan(actor, { type: "article:submit", publisherId: article.publisherId });
      }

      const tags = input.tags ?? [];
      const sourceLinks = input.sourceLinks ?? [];
      let contentHash: string | null = null;
      let previousHash: string | null = existing.previousHash;
      if (input.submit) {
        contentHash = await hashVersionContent({
          headline: input.headline,
          summary: input.summary,
          content: input.content,
          authorName: input.authorName,
          tags,
          sourceLinks,
          changeType: input.changeType,
          changeSummary: input.changeSummary ?? null,
        });
        if (existing.previousVersionId) {
          const prev = await repo.findVersionById(existing.previousVersionId);
          previousHash = prev?.contentHash ?? null;
        }
      }

      const updated = await repo.updateDraftVersion(versionId, {
        headline: input.headline,
        summary: input.summary,
        content: input.content,
        authorName: input.authorName,
        tags,
        sourceLinks,
        changeType: input.changeType,
        changeSummary: input.changeSummary ?? null,
        ...(input.submit
          ? ({ reviewStatus: "pending_review", contentHash, previousHash, publishedAt: new Date() } as never)
          : {}),
      });
      if (!updated) throw new NotFoundError("Version not found");

      if (input.submit && contentHash) {
        await repo.createAnchorRecord({ articleVersionId: updated.id, leafHash: contentHash });
      }

      return toApiVersion(updated);
    },

    async deleteDraftVersion(actor: Actor, articleId: string, versionId: string) {
      const article = await repo.findArticleById(articleId);
      if (!article) throw new NotFoundError("Article not found");
      await authz.assertCan(actor, { type: "article:writeDraft", publisherId: article.publisherId });

      const existing = await repo.findVersionById(versionId);
      if (!existing || existing.articleId !== articleId) throw new NotFoundError("Version not found");
      if (existing.reviewStatus !== "draft") {
        throw new ConflictError("Only a draft version can be deleted");
      }

      await repo.deleteDraftVersion(versionId);
    },

    async archiveArticle(actor: Actor, articleId: string) {
      const article = await repo.findArticleById(articleId);
      if (!article) throw new NotFoundError("Article not found");
      await authz.assertCan(actor, { type: "article:archive", publisherId: article.publisherId });

      const updated = await repo.archiveArticle(articleId);
      if (!updated) throw new NotFoundError("Article not found");
      return toApiArticle(updated);
    },

    async listForPublisher(actor: Actor, publisherId: string, cursor: string | undefined, limit: number) {
      const isMember = await authz.can(actor, { type: "article:writeDraft", publisherId });
      if (!isMember) throw new ForbiddenError("Not a member of this publisher");
      return repo.listForPublisher(publisherId, cursor, limit);
    },
  };
}
