import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("管理后台具备持久化、鉴权和完整 CRUD 契约", async () => {
  const [hosting, schema, migration, categoryMigration, formatMigration, adminPage, adminClient, adminList, adminItem, publicApi, articleServer, home, ecsAdminHtml, ecsAdminScript, ecsServer] = await Promise.all([
    read(".openai/hosting.json"),
    read("db/schema.ts"),
    read("drizzle/0000_skinny_jack_murdock.sql"),
    read("drizzle/0001_merge_article_categories.sql"),
    read("drizzle/0002_peaceful_paladin.sql"),
    read("app/admin/page.tsx"),
    read("app/admin/admin-client.tsx"),
    read("app/api/admin/articles/route.ts"),
    read("app/api/admin/articles/[id]/route.ts"),
    read("app/api/articles/route.ts"),
    read("lib/articles-server.ts"),
    read("app/page.tsx"),
    read("ecs-admin/public/index.html"),
    read("ecs-admin/public/admin.js"),
    read("ecs-admin/server.mjs"),
  ]);

  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(schema, /sqliteTable\(\s*"articles"/);
  assert.match(migration, /CREATE TABLE `articles`/);
  assert.match(migration, /slow-work/);
  assert.match(migration, /small-launch/);
  assert.match(migration, /window-light/);
  assert.match(categoryMigration, /SET `category` = '项目经验'/);
  assert.match(categoryMigration, /`accent` = 'mint'/);
  assert.match(formatMigration, /ADD `content_format` text DEFAULT 'plain' NOT NULL/);
  assert.match(schema, /contentFormat: text\("content_format"\)/);
  assert.match(adminPage, /force-dynamic/);
  assert.match(adminList, /authorizeAdminRequest/);
  assert.match(adminList, /export async function GET/);
  assert.match(adminList, /export async function POST/);
  assert.match(adminItem, /export async function PATCH/);
  assert.match(adminItem, /export async function DELETE/);
  assert.match(publicApi, /listPublishedArticles/);
  assert.match(articleServer, /listArticles\("published"\)/);
  assert.match(home, /fetch\("\/api\/articles"/);
  assert.match(home, /Array\.isArray\(payload\?\.articles\)/);
  assert.match(home, /const pageSize = 6/);
  assert.match(home, /article\.html\?id=/);
  assert.match(home, /categories\.length/);
  assert.doesNotMatch(home, /专业经验|项目复盘|关于知返|每月一封/);
  assert.doesNotMatch(home, /#about|#subscribe|三条线索|data-category-trigger|article-preview/);
  assert.match(ecsAdminHtml, /data-accent-preview/);
  assert.match(ecsAdminHtml, /data-markdown-toolbar/);
  assert.match(ecsAdminHtml, /data-media-dialog/);
  assert.match(ecsAdminHtml, /name="contentFormat"/);
  assert.match(ecsAdminHtml, /maxlength="100000"/);
  assert.match(ecsAdminHtml, /用于文章卡片及正文标题区/);
  assert.match(ecsAdminHtml, /value="项目经验"/);
  assert.match(ecsAdminHtml, /value="生活随想"/);
  assert.doesNotMatch(ecsAdminHtml, /value="专业经验"|value="项目复盘"/);
  assert.match(ecsAdminScript, /updateAccentPreview/);
  assert.match(ecsAdminScript, /\/api\/media\/policy/);
  assert.match(ecsAdminScript, /uploadToOss/);
  assert.match(ecsAdminScript, /ZhifanContent\.renderContent/);
  assert.match(adminClient, /admin-markdown-toolbar/);
  assert.match(adminClient, /ZhifanContent\.renderContent/);
  assert.match(adminClient, /maxLength=\{100000\}/);
  assert.match(ecsServer, /content-length-range/);
  assert.match(ecsServer, /OSS_ACCESS_KEY_SECRET/);
  assert.match(ecsServer, /OSS_USE_ECS_RAM_ROLE/);
  assert.match(ecsServer, /X-aliyun-ecs-metadata-token/);
  assert.match(ecsServer, /meta-data\/ram\/security-credentials/);
  assert.doesNotMatch(ecsServer, /ossAccessKeySecret\s*[,}]/);
  assert.match(ecsAdminScript, /categoryAccents = \{ 项目经验: "mint", 生活随想: "sky" \}/);
  assert.match(articleServer, /normalizeArticleCategory/);
  assert.match(articleServer, /normalizeArticleAccent/);
});
