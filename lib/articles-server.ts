import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import {
  isArticleStatus,
  normalizeArticleAccent,
  normalizeArticleCategory,
  normalizeArticleContentFormat,
  seedArticles,
  type Article,
  type ArticleStatus,
} from "@/lib/articles";

export type ArticleRow = typeof articles.$inferSelect;

export function toArticle(row: ArticleRow): Article {
  const category = normalizeArticleCategory(row.category);
  return {
    id: row.id,
    category,
    date: row.date,
    readTime: row.readTime,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    contentFormat: normalizeArticleContentFormat(row.contentFormat),
    accent: normalizeArticleAccent(category, row.accent),
    status: isArticleStatus(row.status) ? row.status : "draft",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

export async function getArticleDb() {
  return getDb();
}

export async function listArticles(status?: ArticleStatus | "all") {
  const db = await getArticleDb();
  const rows = status && status !== "all"
    ? await db.select().from(articles).where(eq(articles.status, status)).orderBy(desc(articles.updatedAt), desc(articles.id))
    : await db.select().from(articles).orderBy(desc(articles.updatedAt), desc(articles.id));
  return rows.map(toArticle);
}

export async function findArticle(id: string) {
  const db = await getArticleDb();
  const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return { db, row: row ?? null };
}

export async function listPublishedArticles() {
  try {
    return await listArticles("published");
  } catch {
    // GitHub Pages 和本地静态导出没有 D1，继续显示内置的文章内容。
    return seedArticles;
  }
}

export function articleStatusFilter(value: string | null): ArticleStatus | "all" {
  return value === "draft" || value === "published" || value === "archived" ? value : "all";
}

export function publishedAtFor(status: ArticleStatus, current: string | null = null) {
  if (status !== "published") return null;
  return current ?? new Date().toISOString();
}
