import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForServer(url, child, output) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`管理后台提前退出：${child.exitCode}\n${output.text}`);
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // 服务进程仍在启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("等待管理后台启动超时");
}

test("ECS 私有后台支持登录、文章 CRUD 和持久化", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "zhifan-admin-"));
  const dataFile = join(directory, "articles.json");
  const backups = join(directory, "backups");
  const port = await freePort();
  const password = "仅用于自动化测试的密码-2026";
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  const passwordHash = `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
  const seedArticles = JSON.parse(await readFile(new URL("../content/articles.json", import.meta.url), "utf8"));
  const legacyArticles = seedArticles.map((article, index) => {
    if (index === 0) return { ...article, category: "专业经验", accent: "coral" };
    if (index === 1) return { ...article, category: "项目复盘", accent: "sky" };
    return article;
  });
  await writeFile(dataFile, `${JSON.stringify(legacyArticles, null, 2)}\n`, "utf8");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../ecs-admin/server.mjs", import.meta.url))], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_FILE: dataFile,
      BACKUP_DIR: backups,
      SEED_FILE: fileURLToPath(new URL("../content/articles.json", import.meta.url)),
      ADMIN_USERNAME: "zhifan",
      ADMIN_PASSWORD_HASH: passwordHash,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const childOutput = { text: "" };
  child.stdout.on("data", (chunk) => { childOutput.text += chunk.toString(); });
  child.stderr.on("data", (chunk) => { childOutput.text += chunk.toString(); });
  context.after(async () => {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child, childOutput);

  const denied = await fetch(`${baseUrl}/api/articles`);
  assert.equal(denied.status, 401);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "zhifan", password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("zhifan_session="));

  const initial = await fetch(`${baseUrl}/api/articles`, { headers: { Cookie: cookie } }).then((response) => response.json());
  assert.equal(initial.articles.length, 3);
  assert.ok(initial.articles.slice(0, 2).every((article) => article.category === "项目经验" && article.accent === "mint"));
  assert.ok(initial.articles.filter((article) => article.category === "生活随想").every((article) => article.accent === "sky"));
  assert.ok(initial.articles.every((article) => article.contentFormat === "plain"));

  const mediaLibrary = await fetch(`${baseUrl}/api/media`, { headers: { Cookie: cookie } }).then((response) => response.json());
  assert.equal(mediaLibrary.config.enabled, false);
  assert.deepEqual(mediaLibrary.config.allowedHosts, []);

  const mediaPolicy = await fetch(`${baseUrl}/api/media/policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ kind: "image", name: "test.png", mime: "image/png", size: 1024 }),
  });
  assert.equal(mediaPolicy.status, 503);

  const create = await fetch(`${baseUrl}/api/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      category: "项目经验",
      date: "2026.07.27",
      readTime: "3 分钟",
      title: "后台自动化测试草稿",
      excerpt: "这是一篇不会发布到公网的测试草稿。",
      body: "",
      contentFormat: "markdown",
      accent: "mint",
      status: "draft",
    }),
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal(created.article.status, "draft");
  assert.equal(created.article.contentFormat, "markdown");

  const lifeCreate = await fetch(`${baseUrl}/api/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      category: "生活随想",
      date: "2026.07.27",
      readTime: "3 分钟",
      title: "生活随想配色测试",
      excerpt: "",
      body: "",
      contentFormat: "markdown",
      accent: "coral",
      status: "draft",
    }),
  });
  assert.equal(lifeCreate.status, 201);
  const lifeCreated = await lifeCreate.json();
  assert.equal(lifeCreated.article.accent, "sky");

  const update = await fetch(`${baseUrl}/api/articles/${created.article.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ status: "published", body: "  测试正文\n\n```js\nconst safe = true;\n```  " }),
  });
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.equal(updated.article.status, "published");
  assert.ok(updated.article.body.startsWith("  测试正文"));

  const rejectedBase64 = await fetch(`${baseUrl}/api/articles/${created.article.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ body: "data:image/png;base64,AAAA" }),
  });
  assert.equal(rejectedBase64.status, 400);

  const remove = await fetch(`${baseUrl}/api/articles/${created.article.id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  assert.equal(remove.status, 200);

  const removeLife = await fetch(`${baseUrl}/api/articles/${lifeCreated.article.id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  assert.equal(removeLife.status, 200);

  const persisted = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(persisted.length, 3);
  assert.ok(persisted.slice(0, 2).every((article) => article.category === "项目经验" && article.accent === "mint"));
});
