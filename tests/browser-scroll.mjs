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

async function state(cdp) {
  return evaluate(cdp, `({
    y: Math.round(window.scrollY),
    latest: Math.round(document.querySelector('#latest').getBoundingClientRect().top + window.scrollY),
    about: Math.round(document.querySelector('#about').getBoundingClientRect().top + window.scrollY),
    hash: window.location.hash,
    timeOrigin: performance.timeOrigin,
    behavior: getComputedStyle(document.documentElement).scrollBehavior,
    scripts: [...document.scripts].map((script) => script.src || 'inline'),
    rscRequest: performance.getEntriesByType('resource').some((entry) => /\\.rsc(?:[?\\/]|$)/i.test(entry.name)),
    visibleArticles: [...document.querySelectorAll('[data-article-id]')].filter((card) => !card.hidden).length,
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

  await evaluate(cdp, "document.querySelector('a[href=\\\"#about\\\"]').click()");
  await delay(250);
  const about = await state(cdp);
  assert.equal(about.hash, "#about");
  assert.ok(Math.abs(about.y - about.about) <= 2, `关于锚点定位错误：${JSON.stringify(about)}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 450, deltaY: 360, deltaX: 0 });
  await delay(180);
  const aboutWheel = await state(cdp);
  await delay(1000);
  const aboutSettled = await state(cdp);
  assert.ok(aboutSettled.y >= aboutWheel.y - 2, `关于页滚轮后位置被拉回：${JSON.stringify({ aboutWheel, aboutSettled })}`);

  await evaluate(cdp, "history.back()");
  await delay(350);
  const back = await state(cdp);
  assert.equal(back.hash, "#latest");
  assert.ok(Math.abs(back.y - back.latest) <= 2, `后退未恢复文章锚点：${JSON.stringify(back)}`);
  assert.equal(back.timeOrigin, initial.timeOrigin, "前进后退不应触发整页重载");

  await evaluate(cdp, "document.querySelector('[data-read-article]').click()");
  const preview = await evaluate(cdp, "({ hidden: document.querySelector('[data-article-preview]').hidden, title: document.querySelector('[data-preview-title]').textContent })");
  assert.equal(preview.hidden, false);
  assert.ok(preview.title.length > 0);
  await evaluate(cdp, "document.querySelector('[data-close-preview]').click()");
  assert.equal(await evaluate(cdp, "document.querySelector('[data-article-preview]').hidden"), true);

  await evaluate(cdp, "document.querySelector('[data-category-trigger=\\\"项目复盘\\\"]').click()");
  await delay(250);
  const category = await state(cdp);
  assert.equal(category.visibleArticles, 1);
  assert.ok(Math.abs(category.y - category.latest) <= 2, `分类卡片未定位文章区：${JSON.stringify(category)}`);

  console.log(JSON.stringify({ initial, latest, afterWheel, settledWheel, about, aboutWheel, aboutSettled, back, category }, null, 2));
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
