import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("管理后台具备持久化、鉴权和完整 CRUD 契约", async () => {
  const [hosting, schema, migration, adminPage, adminList, adminItem, publicApi, articleServer, home] = await Promise.all([
    read(".openai/hosting.json"),
    read("db/schema.ts"),
    read("drizzle/0000_skinny_jack_murdock.sql"),
    read("app/admin/page.tsx"),
    read("app/api/admin/articles/route.ts"),
    read("app/api/admin/articles/[id]/route.ts"),
    read("app/api/articles/route.ts"),
    read("lib/articles-server.ts"),
    read("app/page.tsx"),
  ]);

  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(schema, /sqliteTable\(\s*"articles"/);
  assert.match(migration, /CREATE TABLE `articles`/);
  assert.match(migration, /slow-work/);
  assert.match(migration, /small-launch/);
  assert.match(migration, /window-light/);
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
});
