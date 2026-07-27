import { articles } from "@/db/schema";
import { parseArticleInput } from "@/lib/article-input";
import { authorizeAdminRequest, validateMutationRequest } from "@/lib/admin-auth";
import {
  articleStatusFilter,
  getArticleDb,
  listArticles,
  toArticle,
} from "@/lib/articles-server";

export const dynamic = "force-dynamic";

function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "后台暂时不可用";
  if (message.includes("no such table") || message.includes("articles")) {
    return "文章数据库还没有初始化，请先完成 Sites 部署迁移。";
  }
  return "后台暂时不可用，请稍后重试。";
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest();
  if (auth.response) return auth.response;

  try {
    const status = articleStatusFilter(new URL(request.url).searchParams.get("status"));
    return Response.json(
      { articles: await listArticles(status) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: serverError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest();
  if (auth.response) return auth.response;
  const requestError = validateMutationRequest(request, { json: true });
  if (requestError) return requestError;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = parseArticleInput(payload);
    if (parsed.error || !parsed.value) {
      return Response.json({ error: parsed.error ?? "文章内容不完整" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const status = parsed.value.status ?? "draft";
    const db = await getArticleDb();
    const [row] = await db
      .insert(articles)
      .values({
        id: `article-${crypto.randomUUID()}`,
        category: parsed.value.category!,
        date: parsed.value.date!,
        readTime: parsed.value.readTime!,
        title: parsed.value.title!,
        excerpt: parsed.value.excerpt ?? "",
        body: parsed.value.body ?? "",
        accent: parsed.value.accent!,
        status,
        createdAt: now,
        updatedAt: now,
        publishedAt: status === "published" ? now : null,
      })
      .returning();

    if (!row) return Response.json({ error: "文章保存失败" }, { status: 500 });
    return Response.json({ article: toArticle(row) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: serverError(error) }, { status: 500 });
  }
}
