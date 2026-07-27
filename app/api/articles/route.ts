import { listPublishedArticles } from "@/lib/articles-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await listPublishedArticles();
  return Response.json(
    { articles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
