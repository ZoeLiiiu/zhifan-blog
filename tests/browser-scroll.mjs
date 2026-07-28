import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const remoteUrl = process.env.TEST_URL;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function freePort() {
  return new Promise((resolvePromise, reject) => {
    const probe = createTcpServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolvePromise(address.port));
    });
  });
}

async function waitFor(url, predicate, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (predicate(response)) return response;
    } catch {
      // 调试端口尚未启动，继续轮询。
    }
    await delay(100);
  }
  throw new Error(`等待超时：${url}`);
}

function createCdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  const handleMessage = (event) => {
    const message = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolveMessage, reject: rejectMessage } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectMessage(new Error(message.error.message));
    else resolveMessage(message.result);
  };
  socket.addEventListener("message", handleMessage);

  return {
    send(method, params = {}) {
      return new Promise((resolveMessage, rejectMessage) => {
        const id = ++nextId;
        pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.removeEventListener("message", handleMessage);
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result?.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "浏览器执行脚本失败");
  }
  return result?.result?.value;
}

async function waitForPage(cdp) {
  let lastState;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    lastState = await evaluate(cdp, `({
      url: location.href,
      readyState: document.readyState,
      hasLatest: !!document.querySelector('#latest'),
      title: document.title,
      body: document.body?.textContent?.slice(0, 80),
    })`);
    if (lastState?.readyState === "complete" && lastState.hasLatest) return;
    await delay(100);
  }
  throw new Error(`页面加载超时：${JSON.stringify(lastState)}`);
}

async function waitForArticle(cdp, expected = "article") {
  let lastState;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    lastState = await evaluate(cdp, `({
      readyState: document.readyState,
      articleVisible: !!document.querySelector('[data-article]:not([hidden])'),
      errorVisible: !!document.querySelector('[data-error]:not([hidden])'),
      title: document.title,
      url: location.href,
    })`);
    if (lastState?.readyState === "complete" && (
      (expected === "article" && lastState.articleVisible) ||
      (expected === "error" && lastState.errorVisible)
    )) return lastState;
    await delay(100);
  }
  throw new Error(`文章页加载超时：${JSON.stringify(lastState)}`);
}

async function state(cdp) {
  return evaluate(cdp, `({
    y: Math.round(window.scrollY),
    latest: Math.round(document.querySelector('#latest').getBoundingClientRect().top + window.scrollY),
    hash: window.location.hash,
    timeOrigin: performance.timeOrigin,
    behavior: getComputedStyle(document.documentElement).scrollBehavior,
    scripts: [...document.scripts].map((script) => script.src || 'inline'),
    rscRequest: performance.getEntriesByType('resource').some((entry) => /\\.rsc(?:[?\\/]|$)/i.test(entry.name)),
    visibleArticles: [...document.querySelectorAll('[data-article-id]')].filter((card) => !card.hidden).length,
    loadMoreHidden: document.querySelector('[data-load-more-row]')?.hidden ?? true,
  })`);
}

const server = remoteUrl ? null : createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const filePath = resolve(root, relativePath);
    if (relative(root, filePath).startsWith("..")) throw new Error("非法路径");
    const contents = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(contents);
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${error instanceof Error ? error.message : String(error)}`);
  }
});

let chrome;
let cdp;
let userData;

try {
  const debugPort = await freePort();
  let sitePort;
  if (server) {
    sitePort = await freePort();
    await new Promise((resolvePromise) => server.listen(sitePort, "127.0.0.1", resolvePromise));
  }
  userData = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? ".", "zhifan-chrome-"));
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userData}`,
    "--window-size=1280,900",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  const targetsResponse = await waitFor(`http://127.0.0.1:${debugPort}/json/list`, (response) => response.ok);
  const targets = await targetsResponse.json();
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("没有找到 Chrome 调试页面");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });
  cdp = createCdpClient(socket);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Page.navigate", { url: remoteUrl ?? `http://127.0.0.1:${sitePort}/` });
  await waitForPage(cdp);
  await delay(250);

  const initial = await state(cdp);
  assert.equal(initial.behavior, "auto");
  assert.equal(initial.scripts.length, 1);
  assert.match(initial.scripts[0], /\/static\.js(?:[?#]|$)/);
  assert.equal(initial.rscRequest, false);
  assert.equal(initial.visibleArticles, 6);
  assert.equal(initial.loadMoreHidden, false);
  const structure = await evaluate(cdp, `({
    filters: [...document.querySelectorAll('[data-filter]')].map((button) => button.dataset.filter),
    hasAbout: !!document.querySelector('#about'),
    hasSubscribe: !!document.querySelector('#subscribe'),
    longTermCount: [...document.querySelectorAll('.signal-bar div')].find((item) => item.textContent.includes('长期栏目'))?.querySelector('strong')?.textContent,
  })`);
  assert.deepEqual(structure.filters, ["全部", "项目经验", "生活随想"]);
  assert.equal(structure.hasAbout, false);
  assert.equal(structure.hasSubscribe, false);
  assert.equal(structure.longTermCount, "02");

  await evaluate(cdp, "document.querySelector('a[href=\\\"#latest\\\"]').click()");
  await delay(250);
  const latest = await state(cdp);
  assert.equal(latest.hash, "#latest");
  assert.ok(Math.abs(latest.y - latest.latest) <= 2, `文章锚点定位错误：${JSON.stringify(latest)}`);
  assert.equal(latest.timeOrigin, initial.timeOrigin, "点击锚点不应触发整页重载");

  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 450, deltaY: 520, deltaX: 0 });
  await delay(180);
  const afterWheel = await state(cdp);
  await delay(1000);
  const settledWheel = await state(cdp);
  assert.ok(afterWheel.y > latest.y + 80, `滚轮没有继续向下：${JSON.stringify({ latest, afterWheel })}`);
  assert.ok(settledWheel.y >= afterWheel.y - 2, `滚轮后位置被拉回：${JSON.stringify({ afterWheel, settledWheel })}`);
  assert.equal(settledWheel.timeOrigin, initial.timeOrigin);

  await evaluate(cdp, "document.querySelector('[data-load-more]').click()");
  const loaded = await state(cdp);
  assert.equal(loaded.visibleArticles, 7);
  assert.equal(loaded.loadMoreHidden, true);
  const projectCards = await evaluate(cdp, `[...document.querySelectorAll('[data-article-category="项目经验"]')].map((card) => ({ className: card.className, accent: card.dataset.articleAccent }))`);
  assert.equal(projectCards.length, 4);
  assert.ok(projectCards.every((card) => card.className.includes("card-mint") && card.accent === "mint"), `项目经验应统一使用薄荷绿：${JSON.stringify(projectCards)}`);

  await evaluate(cdp, "document.querySelector('[data-filter=\\\"项目经验\\\"]').click()");
  await delay(250);
  const category = await state(cdp);
  assert.equal(category.visibleArticles, 4);
  assert.equal(category.loadMoreHidden, true);

  const articleHref = await evaluate(cdp, "document.querySelector('[data-read-article]').href");
  await cdp.send("Page.navigate", { url: articleHref });
  await waitForArticle(cdp);
  const detail = await evaluate(cdp, `({
    url: location.href,
    y: Math.round(window.scrollY),
    articleTop: Math.round(document.querySelector('[data-article]').getBoundingClientRect().top),
    title: document.querySelector('[data-title]').textContent,
    body: document.querySelector('[data-body]').textContent,
    accent: document.querySelector('[data-article]').className,
  })`);
  assert.match(detail.url, /article\.html\?id=/);
  assert.equal(detail.y, 0);
  assert.ok(detail.articleTop < 900, `正文标题区应在首屏可见：${JSON.stringify(detail)}`);
  assert.ok(detail.title.length > 0);
  assert.ok(detail.body.length > 0);
  assert.match(detail.accent, /accent-mint/);

  await evaluate(cdp, "history.back()");
  await waitForPage(cdp);
  const returned = await state(cdp);
  assert.ok(returned.visibleArticles > 0);

  await cdp.send("Page.navigate", { url: articleHref });
  await waitForArticle(cdp);
  const richContent = await evaluate(cdp, `(() => {
    const container = document.createElement('div');
    document.body.append(container);
    window.__zhifanXss = 0;
    window.ZhifanContent.renderContent(
      container,
      '# 安全标题\\n\\n<script>window.__zhifanXss = 1<\\/script>\\n\\n[危险链接](javascript:window.__zhifanXss=2)\\n\\n\`\`\`html\\n<img src=x onerror="window.__zhifanXss=3">\\n\`\`\`\\n\\n@[video](https://evil.example/video.mp4 "危险视频")\\n\\n@[video](https://media.example.com/video.mp4 "正常视频")',
      'markdown',
      { allowedMediaHosts: ['media.example.com'] },
    );
    return {
      xss: window.__zhifanXss,
      scripts: container.querySelectorAll('script').length,
      unsafeHrefs: [...container.querySelectorAll('a')].filter((link) => /^javascript:/i.test(link.getAttribute('href') || '')).length,
      mediaErrors: container.querySelectorAll('.content-media-error').length,
      videos: container.querySelectorAll('video').length,
      code: container.querySelector('pre code')?.textContent,
      rawHtmlVisible: container.textContent.includes('<script>'),
    };
  })()`);
  assert.equal(richContent.xss, 0);
  assert.equal(richContent.scripts, 0);
  assert.equal(richContent.unsafeHrefs, 0);
  assert.equal(richContent.mediaErrors, 1);
  assert.equal(richContent.videos, 1);
  assert.match(richContent.code, /onerror/);
  assert.equal(richContent.rawHtmlVisible, true);

  const missingUrl = await evaluate(cdp, "new URL('./article.html?id=missing-article', location.href).href");
  await cdp.send("Page.navigate", { url: missingUrl });
  const missing = await waitForArticle(cdp, "error");
  assert.match(missing.title, /文章暂时不在这里/);

  console.log(JSON.stringify({ initial, structure, latest, afterWheel, settledWheel, loaded, projectCards, category, detail, returned, richContent, missing }, null, 2));
} finally {
  if (cdp) {
    try {
      await cdp.send("Browser.close");
    } catch {
      // 页面已经退出时无需重复关闭。
    }
    cdp.close();
  }
  if (chrome && chrome.exitCode === null) {
    await Promise.race([once(chrome, "exit"), delay(5000)]);
    if (chrome.exitCode === null) chrome.kill();
  }
  if (server) await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  if (userData) await rm(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
