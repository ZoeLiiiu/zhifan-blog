import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    date: text("date").notNull(),
    readTime: text("read_time").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    contentFormat: text("content_format").notNull().default("plain"),
    accent: text("accent").notNull().default("mint"),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => ({
    statusIndex: index("articles_status_idx").on(table.status),
    updatedAtIndex: index("articles_updated_at_idx").on(table.updatedAt),
  }),
);
