export type Category = "全部" | "专业经验" | "项目复盘" | "生活随想";

export type ArticleStatus = "draft" | "published" | "archived";

export type Article = {
  id: string;
  category: Exclude<Category, "全部">;
  date: string;
  readTime: string;
  title: string;
  excerpt: string;
  body: string;
  accent: "mint" | "coral" | "sky";
  status?: ArticleStatus;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
};

export const seedArticles: Article[] = [
  {
    id: "slow-work",
    category: "专业经验",
    date: "2026.07.12",
    readTime: "6 分钟",
    title: "把复杂的事，讲成别人听得懂的事",
    excerpt: "好的表达不是把话说满，而是给对方一条可以走下去的路。",
    body: "我把这件事拆成三个动作：先说结论，再补关键证据，最后留下一个可执行的下一步。写文档、做汇报、和人协作，其实都适用。",
    accent: "mint",
    status: "published",
  },
  {
    id: "small-launch",
    category: "项目复盘",
    date: "2026.06.28",
    readTime: "8 分钟",
    title: "一个小功能上线后，我学会了先问为什么",
    excerpt: "复盘不是寻找谁做错了，而是找出系统怎样才能更温柔地工作。",
    body: "这次上线最有价值的部分，不是交付了多少代码，而是让我们看见了需求、节奏和反馈之间的缝隙。下一次，我会把验证提前一周。",
    accent: "coral",
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
    accent: "sky",
    status: "published",
  },
];

export const categories: {
  label: Exclude<Category, "全部">;
  note: string;
}[] = [
  { label: "专业经验", note: "方法、协作与表达" },
  { label: "项目复盘", note: "做过的事与学到的课" },
  { label: "生活随想", note: "慢下来，也继续生长" },
];

export const categoryColors: Record<Exclude<Category, "全部">, string> = {
  专业经验: "mint",
  项目复盘: "coral",
  生活随想: "sky",
};

export const articleCategories = categories.map((item) => item.label);

export function isArticleCategory(value: unknown): value is Exclude<Category, "全部"> {
  return typeof value === "string" && articleCategories.includes(value as Exclude<Category, "全部">);
}

export function isArticleAccent(value: unknown): value is Article["accent"] {
  return value === "mint" || value === "coral" || value === "sky";
}

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return value === "draft" || value === "published" || value === "archived";
}
