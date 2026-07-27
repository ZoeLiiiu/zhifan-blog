import { eq } from "drizzle-orm";
import { articles } from "@/db/schema";
import { parseArticleInput } from "@/lib/article-input";
import { authorizeAdminRequest, validateMutationRequest } from "@/lib/admin-auth";
import { getArticleDb, publishedAtFor, toArticle } from "@/lib/articles-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "后台暂时不可用";
  if (message.includes("no such table") || message.includes("articles")) {
    return "文章数据库还没有初始化，请先完成 Sites 部署迁移。";
  }
  return "后台暂时不可用，请稍后重试。";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorizeAdminRequest();
  if (auth.response) return auth.response;
  const requestError = validateMutationRequest(request, { json: true });
  if (requestError) return requestError;

  try {
    const { id } = await context.params;
    const db = await getArticleDb();
    const [existing] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    if (!existing) return Response.json({ error: "文章不存在" }, { status: 404 });

    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = parseArticleInput(payload, { partial: true });
    if (parsed.error || !parsed.value) {
      return Response.json({ error: parsed.error ?? "文章内容不完整" }, { status: 400 });
    }

    const currentStatus = existing.status === "published" || existing.status === "archived"
      ? existing.status
      : "draft";
    const nextStatus = parsed.value.status ?? currentStatus;
    const nextBody = parsed.value.body ?? existing.body;
    if (nextStatus === "published" && !nextBody.trim()) {
      return Response.json({ error: "发布文章前请先填写正文" }, { status: 400 });
    }
    const [row] = await db
      .update(articles)
      .set({
        ...parsed.value,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        publishedAt: publishedAtFor(nextStatus, existing.publishedAt),
      })
      .where(eq(articles.id, id))
      .returning();

    if (!row) return Response.json({ error: "文章保存失败" }, { status: 500 });
    return Response.json({ article: toArticle(row) });
  } catch (error) {
    return Response.json({ error: serverError(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await authorizeAdminRequest();
  if (auth.response) return auth.response;
  const requestError = validateMutationRequest(_request);
  if (requestError) return requestError;

  try {
    const { id } = await context.params;
    const db = await getArticleDb();
    const [deleted] = await db.delete(articles).where(eq(articles.id, id)).returning({ id: articles.id });
    if (!deleted) return Response.json({ error: "文章不存在" }, { status: 404 });
    return Response.json({ ok: true, id: deleted.id });
  } catch (error) {
    return Response.json({ error: serverError(error) }, { status: 500 });
  }
}
