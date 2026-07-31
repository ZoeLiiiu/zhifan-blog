export type Category = "全部" | "项目经验" | "生活随想";
export type ArticleCategory = Exclude<Category, "全部">;

export type ArticleStatus = "draft" | "published" | "archived";
export type ArticleContentFormat = "plain" | "markdown";

export type Article = {
  id: string;
  category: ArticleCategory;
  date: string;
  readTime: string;
  title: string;
  excerpt: string;
  body: string;
  contentFormat: ArticleContentFormat;
  accent: "mint" | "coral" | "sky";
  status?: ArticleStatus;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
};

export const seedArticles: Article[] = [
  {
    id: "slow-work",
    category: "项目经验",
    date: "2026.07.12",
    readTime: "6 分钟",
    title: "把复杂的事，讲成别人听得懂的事",
    excerpt: "好的表达不是把话说满，而是给对方一条可以走下去的路。",
    body: "我把这件事拆成三个动作：先说结论，再补关键证据，最后留下一个可执行的下一步。写文档、做汇报、和人协作，其实都适用。",
    contentFormat: "plain",
    accent: "mint",
    status: "published",
  },
  {
    id: "small-launch",
    category: "项目经验",
    date: "2026.06.28",
    readTime: "8 分钟",
    title: "一个小功能上线后，我学会了先问为什么",
    excerpt: "复盘不是寻找谁做错了，而是找出系统怎样才能更温柔地工作。",
    body: "这次上线最有价值的部分，不是交付了多少代码，而是让我们看见了需求、节奏和反馈之间的缝隙。下一次，我会把验证提前一周。",
    contentFormat: "plain",
    accent: "mint",
    status: "published",
  },
  {
    id: "window-light",
    category: "生活随想",
    date: "2026.06.05",
    readTime: "4 分钟",
    title: "给日子留一点没有安排的时间",
    excerpt: "当生活不再只剩下待办事项，心里才会长出新的方向。",
    body: "我开始把每周的一小段时间留给散步、发呆和不带目的地读几页书。那些看似没有产出的时刻，反而让下一次出发变得清醒。",
    contentFormat: "plain",
    accent: "sky",
    status: "published",
  },
];

export const categories: {
  label: ArticleCategory;
  note: string;
}[] = [
  { label: "项目经验", note: "方法、协作、实践与复盘" },
  { label: "生活随想", note: "慢下来，也继续生长" },
];

export const categoryColors: Record<ArticleCategory, Article["accent"]> = {
  项目经验: "mint",
  生活随想: "sky",
};

export const articleCategories = categories.map((item) => item.label);

export function isArticleCategory(value: unknown): value is ArticleCategory {
  return typeof value === "string" && articleCategories.includes(value as ArticleCategory);
}

export function normalizeArticleCategory(value: unknown): ArticleCategory {
  return value === "生活随想" ? "生活随想" : "项目经验";
}

export function isArticleAccent(value: unknown): value is Article["accent"] {
  return value === "mint" || value === "coral" || value === "sky";
}

export function normalizeArticleAccent(category: ArticleCategory, value: unknown): Article["accent"] {
  void value;
  return categoryColors[category];
}

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return value === "draft" || value === "published" || value === "archived";
}

export function isArticleContentFormat(value: unknown): value is ArticleContentFormat {
  return value === "plain" || value === "markdown";
}

export function normalizeArticleContentFormat(value: unknown): ArticleContentFormat {
  return value === "markdown" ? "markdown" : "plain";
}
