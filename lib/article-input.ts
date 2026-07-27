import {
  isArticleAccent,
  isArticleCategory,
  isArticleStatus,
  type Category,
  type ArticleStatus,
} from "@/lib/articles";

export type ArticleInput = {
  category: Exclude<Category, "全部">;
  date: string;
  readTime: string;
  title: string;
  excerpt: string;
  body: string;
  accent: "mint" | "coral" | "sky";
  status: ArticleStatus;
};

type ParseOptions = { partial?: boolean };

export function parseArticleInput(
  payload: Record<string, unknown>,
  options: ParseOptions = {},
): { value?: Partial<ArticleInput>; error?: string } {
  const value: Partial<ArticleInput> = {};
  const fields = [
    "category",
    "date",
    "readTime",
    "title",
    "excerpt",
    "body",
    "accent",
    "status",
  ] as const;

  for (const field of fields) {
    if (options.partial && !(field in payload)) continue;
    const raw = payload[field];
    if (typeof raw !== "string") return { error: `${field} 必须是文本` };
    value[field] = raw.trim() as never;
  }

  if (value.title !== undefined && (!value.title || value.title.length > 120)) {
    return { error: "标题不能为空且不能超过 120 个字" };
  }
  if (value.category !== undefined && !isArticleCategory(value.category)) {
    return { error: "请选择有效的文章分类" };
  }
  if (value.date !== undefined && (!value.date || value.date.length > 20)) {
    return { error: "日期不能为空且不能超过 20 个字" };
  }
  if (value.readTime !== undefined && (!value.readTime || value.readTime.length > 20)) {
    return { error: "阅读时长不能为空且不能超过 20 个字" };
  }
  if (value.excerpt !== undefined && value.excerpt.length > 300) {
    return { error: "摘要不能超过 300 个字" };
  }
  if (value.body !== undefined && value.body.length > 30000) {
    return { error: "正文不能超过 30000 个字" };
  }
  if (!options.partial && value.status === "published" && !value.body) {
    return { error: "发布文章前请先填写正文" };
  }
  if (value.accent !== undefined && !isArticleAccent(value.accent)) {
    return { error: "请选择有效的配色" };
  }
  if (value.status !== undefined && !isArticleStatus(value.status)) {
    return { error: "请选择有效的文章状态" };
  }

  return { value };
}
