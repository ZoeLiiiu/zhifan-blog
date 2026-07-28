import { execFile } from "node:child_process";
import {
  createReadStream,
  existsSync,
} from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const appRoot = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(appRoot, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3210);
const dataFile = resolve(process.env.DATA_FILE || join(appRoot, "data", "articles.json"));
const seedFile = resolve(process.env.SEED_FILE || join(appRoot, "..", "content", "articles.json"));
const backupDir = resolve(process.env.BACKUP_DIR || join(dirname(dataFile), "backups"));
const repoDir = process.env.REPO_DIR ? resolve(process.env.REPO_DIR) : "";
const adminUsername = process.env.ADMIN_USERNAME || "zhifan";
const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
const sessions = new Map();
const loginAttempts = new Map();
const categories = new Set(["项目经验", "生活随想"]);
const statuses = new Set(["draft", "published", "archived"]);
const accents = new Set(["mint", "coral", "sky"]);
const maxBodyBytes = 1024 * 1024;
let mutationQueue = Promise.resolve();

if (!passwordHash.startsWith("scrypt$")) {
  throw new Error("缺少有效的 ADMIN_PASSWORD_HASH");
}

function securityHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extra,
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  }));
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  response.end(text);
}

function parseCookies(request) {
  const cookies = {};
  for (const item of (request.headers.cookie || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    cookies[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
  }
  return cookies;
}

function currentSession(request) {
  const token = parseCookies(request).zhifan_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  return session;
}

function requireSession(request, response) {
  const session = currentSession(request);
  if (!session) {
    sendJson(response, 401, { error: "请先登录管理后台" });
    return null;
  }
  return session;
}

function verifyPassword(password) {
  const [, saltEncoded, expectedEncoded] = passwordHash.split("$");
  if (!saltEncoded || !expectedEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(expectedEncoded, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verifySameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("请求格式必须是 JSON"), { statusCode: 415 });
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw Object.assign(new Error("请求内容过大"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("JSON 格式不正确"), { statusCode: 400 });
  }
}

function cleanText(value, maxLength, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw Object.assign(new Error("请填写完整的文章内容"), { statusCode: 400 });
  if (text.length > maxLength) throw Object.assign(new Error(`内容不能超过 ${maxLength} 个字符`), { statusCode: 400 });
  return text;
}

function normalizeStoredArticle(article) {
  const category = article?.category === "生活随想" ? "生活随想" : "项目经验";
  const accent = category === "项目经验"
    ? "mint"
    : accents.has(article?.accent) ? article.accent : "sky";
  return { ...article, category, accent };
}

function parseArticle(payload, existing = null) {
  const category = payload.category ?? existing?.category;
  const status = payload.status ?? existing?.status ?? "draft";
  const requestedAccent = payload.accent ?? existing?.accent ?? "mint";
  if (!categories.has(category)) throw Object.assign(new Error("请选择有效的文章分类"), { statusCode: 400 });
  if (!statuses.has(status)) throw Object.assign(new Error("请选择有效的文章状态"), { statusCode: 400 });
  if (!accents.has(requestedAccent)) throw Object.assign(new Error("请选择有效的文章配色"), { statusCode: 400 });
  const accent = category === "项目经验" ? "mint" : requestedAccent;

  const article = {
    id: existing?.id || `article-${randomUUID()}`,
    category,
    date: cleanText(payload.date ?? existing?.date, 32, true),
    readTime: cleanText(payload.readTime ?? existing?.readTime, 32, true),
    title: cleanText(payload.title ?? existing?.title, 160, true),
    excerpt: cleanText(payload.excerpt ?? existing?.excerpt, 500),
    body: cleanText(payload.body ?? existing?.body, 50000, status === "published"),
    accent,
    status,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: status === "published"
      ? existing?.publishedAt || new Date().toISOString()
      : null,
  };
  return article;
}

async function ensureDataFile() {
  await mkdir(dirname(dataFile), { recursive: true });
  await mkdir(backupDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await copyFile(seedFile, dataFile);
  }
}

async function readArticles() {
  await ensureDataFile();
  const parsed = JSON.parse(await readFile(dataFile, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("文章数据库格式不正确");
  return parsed.map(normalizeStoredArticle);
}

async function migrateLegacyArticles() {
  await ensureDataFile();
  const parsed = JSON.parse(await readFile(dataFile, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("文章数据库格式不正确");
  const normalized = parsed.map(normalizeStoredArticle);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    await writeArticles(normalized);
  }
}

async function backupArticles() {
  if (!existsSync(dataFile)) return;
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  await copyFile(dataFile, join(backupDir, `articles-${stamp}.json`));
  const backups = (await readdir(backupDir))
    .filter((name) => /^articles-.*\.json$/.test(name))
    .sort()
    .reverse();
  await Promise.all(backups.slice(30).map((name) => unlink(join(backupDir, name))));
}

async function writeArticles(articles) {
  await ensureDataFile();
  await backupArticles();
  const temporary = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(articles, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, dataFile);
}

async function runGit(args) {
  if (!repoDir) throw new Error("尚未配置 GitHub 仓库目录");
  return execFileAsync("git", args, {
    cwd: repoDir,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    timeout: 60000,
    windowsHide: true,
  });
}

async function publishArticles(articles) {
  if (!repoDir) return { published: false, warning: "尚未配置 GitHub 自动发布" };
  const publicArticles = articles
    .filter((article) => article.status === "published")
    .sort((left, right) => String(right.publishedAt || right.updatedAt).localeCompare(String(left.publishedAt || left.updatedAt)));

  try {
    await runGit(["pull", "--rebase", "origin", "main"]);
    const target = join(repoDir, "docs", "articles.json");
    await writeFile(target, `${JSON.stringify(publicArticles, null, 2)}\n`, "utf8");
    await runGit(["add", "docs/articles.json"]);
    const diff = await runGit(["diff", "--cached", "--quiet"]).then(() => false, (error) => {
      if (error.code === 1) return true;
      throw error;
    });
    if (!diff) return { published: true, changed: false };
    await runGit(["commit", "-m", "通过知返后台更新文章"]);
    await runGit(["push", "origin", "main"]);
    return { published: true, changed: true };
  } catch (error) {
    console.error("GitHub 发布失败", error instanceof Error ? error.message : error);
    return { published: false, warning: "文章已保存，但 GitHub Pages 发布失败，请稍后重试发布" };
  }
}

function queueMutation(task) {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.catch(() => {});
  return result;
}

async function handleLogin(request, response) {
  const address = request.socket.remoteAddress || "unknown";
  const attempt = loginAttempts.get(address) || { count: 0, resetAt: 0 };
  if (attempt.resetAt > Date.now() && attempt.count >= 5) {
    sendJson(response, 429, { error: "登录尝试过多，请十分钟后再试" });
    return;
  }
  if (attempt.resetAt <= Date.now()) {
    attempt.count = 0;
    attempt.resetAt = Date.now() + 10 * 60 * 1000;
  }

  const body = await readJsonBody(request);
  const validUser = typeof body.username === "string" && body.username === adminUsername;
  const validPassword = typeof body.password === "string" && verifyPassword(body.password);
  if (!validUser || !validPassword) {
    attempt.count += 1;
    loginAttempts.set(address, attempt);
    sendJson(response, 401, { error: "用户名或密码不正确" });
    return;
  }

  loginAttempts.delete(address);
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, {
    username: adminUsername,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  });
  sendJson(response, 200, { user: { username: adminUsername } }, {
    "Set-Cookie": `zhifan_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
  });
}

async function handleApi(request, response, url) {
  if (!verifySameOrigin(request)) {
    sendJson(response, 403, { error: "请求来源无效" });
    return;
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    await handleLogin(request, response);
    return;
  }

  if (url.pathname === "/api/session" && request.method === "GET") {
    const session = currentSession(request);
    sendJson(response, session ? 200 : 401, session
      ? { user: { username: session.username } }
      : { error: "未登录" });
    return;
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    const token = parseCookies(request).zhifan_session;
    if (token) sessions.delete(token);
    sendJson(response, 200, { ok: true }, {
      "Set-Cookie": "zhifan_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
    return;
  }

  if (!requireSession(request, response)) return;

  if (url.pathname === "/api/articles" && request.method === "GET") {
    sendJson(response, 200, { articles: await readArticles() });
    return;
  }

  if (url.pathname === "/api/articles" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const result = await queueMutation(async () => {
      const articles = await readArticles();
      const article = parseArticle(payload);
      articles.unshift(article);
      await writeArticles(articles);
      return { article, publish: await publishArticles(articles) };
    });
    sendJson(response, 201, result);
    return;
  }

  if (url.pathname === "/api/publish" && request.method === "POST") {
    const publish = await queueMutation(async () => publishArticles(await readArticles()));
    sendJson(response, publish.published ? 200 : 502, { publish });
    return;
  }

  const match = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
  if (match && request.method === "PATCH") {
    const id = decodeURIComponent(match[1]);
    const payload = await readJsonBody(request);
    const result = await queueMutation(async () => {
      const articles = await readArticles();
      const index = articles.findIndex((article) => article.id === id);
      if (index < 0) throw Object.assign(new Error("没有找到这篇文章"), { statusCode: 404 });
      const article = parseArticle(payload, articles[index]);
      articles[index] = article;
      await writeArticles(articles);
      return { article, publish: await publishArticles(articles) };
    });
    sendJson(response, 200, result);
    return;
  }

  if (match && request.method === "DELETE") {
    const id = decodeURIComponent(match[1]);
    const result = await queueMutation(async () => {
      const articles = await readArticles();
      const nextArticles = articles.filter((article) => article.id !== id);
      if (nextArticles.length === articles.length) {
        throw Object.assign(new Error("没有找到这篇文章"), { statusCode: 404 });
      }
      await writeArticles(nextArticles);
      return { deleted: true, publish: await publishArticles(nextArticles) };
    });
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "接口不存在" });
}

async function serveStatic(response, pathname) {
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = resolve(publicRoot, fileName);
  if (!target.startsWith(`${publicRoot}${sep}`) || !existsSync(target) || !(await stat(target)).isFile()) {
    sendText(response, 404, "页面不存在");
    return;
  }

  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extname(target)] || "application/octet-stream";
  response.writeHead(200, securityHeaders({ "Content-Type": contentType }));
  createReadStream(target).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "不支持此请求");
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    if (statusCode >= 500) console.error(error);
    sendJson(response, statusCode, {
      error: statusCode >= 500 ? "后台暂时不可用，请稍后重试" : error.message,
    });
  }
});

await migrateLegacyArticles();
server.listen(port, host, () => {
  console.log(`知返管理后台已启动：http://${host}:${port}`);
});
