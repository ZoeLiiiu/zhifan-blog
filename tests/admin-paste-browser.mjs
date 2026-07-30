import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../ecs-admin/public/", import.meta.url)));
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const mark = (message) => console.log(`[admin-paste] ${message}`);

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
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (predicate(response)) return response;
    } catch {
      // 调试端口尚未启动，继续轮询。
    }
    await delay(100);
  }
  throw new Error(`等待超时：${url}`);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function createCdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  const handleMessage = async (event) => {
    const payload = typeof event.data === "string"
      ? event.data
      : event.data instanceof Blob
        ? await event.data.text()
        : new TextDecoder().decode(event.data);
    const message = JSON.parse(payload);
    if (!message.id || !pending.has(message.id)) return;
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  };
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", () => {
    for (const callbacks of pending.values()) callbacks.reject(new Error("Chrome 调试连接已关闭"));
    pending.clear();
  });
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
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "浏览器执行脚本失败");
  return result?.result?.value;
}

async function waitForPage(cdp) {
  let state;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    state = await evaluate(cdp, `({
      ready: document.readyState,
      adminVisible: !!document.querySelector('[data-admin-view]:not([hidden])'),
      hasBody: !!document.querySelector('textarea[name="body"]'),
    })`);
    if (state.ready === "complete" && state.adminVisible && state.hasBody) return;
    await delay(100);
  }
  throw new Error(`后台页面加载超时：${JSON.stringify(state)}`);
}

async function waitForValue(cdp, expression, timeout = 8000) {
  let value;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    value = await evaluate(cdp, expression);
    if (value) return value;
    await delay(80);
  }
  throw new Error(`等待浏览器状态超时：${expression}，最后结果 ${JSON.stringify(value)}`);
}

const mediaById = new Map();
const failedNames = new Set();
let mediaSequence = 0;
let policyCount = 0;
let completeCount = 0;
let cleanupCount = 0;
let sitePort;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${sitePort}`);
    if (request.method === "GET" && url.pathname === "/api/session") return sendJson(response, 200, { authenticated: true });
    if (request.method === "GET" && url.pathname === "/api/articles") {
      return sendJson(response, 200, {
        articles: [{
          id: "plain-article",
          category: "项目经验",
          date: "2026.07.30",
          readTime: "3 分钟",
          title: "旧纯文本文章",
          excerpt: "",
          body: "旧正文",
          contentFormat: "plain",
          accent: "mint",
          status: "draft",
        }],
      });
    }
    if (request.method === "GET" && url.pathname === "/api/media") {
      return sendJson(response, 200, {
        media: [],
        config: {
          enabled: true,
          allowedHosts: [`127.0.0.1:${sitePort}`],
          imageMaxBytes: 10 * 1024 * 1024,
        },
      });
    }
    if (request.method === "POST" && url.pathname === "/api/media/policy") {
      const body = await readJson(request);
      policyCount += 1;
      const id = `media-${++mediaSequence}`;
      const record = {
        id,
        key: `public/mock/${id}.png`,
        kind: "image",
        originalName: body.name,
        mime: body.mime,
        size: body.size,
        status: "pending",
      };
      mediaById.set(id, record);
      return sendJson(response, 200, {
        uploadUrl: `http://127.0.0.1:${sitePort}/mock-oss/${id}`,
        fields: { key: record.key, policy: "mock-policy", signature: "mock-signature" },
        media: record,
      });
    }
    if (request.method === "POST" && url.pathname.startsWith("/mock-oss/")) {
      const id = url.pathname.split("/").at(-1);
      const record = mediaById.get(id);
      request.resume();
      await once(request, "end");
      if (record?.originalName === "retry.png" && !failedNames.has(record.originalName)) {
        failedNames.add(record.originalName);
        response.writeHead(500);
        return response.end();
      }
      if (record?.originalName === "late.png" || record?.originalName === "cancel.png") await delay(350);
      response.writeHead(204);
      return response.end();
    }
    if (request.method === "POST" && url.pathname === "/api/media/complete") {
      const body = await readJson(request);
      const record = mediaById.get(body.id);
      completeCount += 1;
      const completed = {
        ...record,
        status: "ready",
        url: `http://127.0.0.1:${sitePort}/mock-media/${record.id}.png`,
      };
      mediaById.set(record.id, completed);
      return sendJson(response, 200, {
        media: completed,
        config: {
          enabled: true,
          allowedHosts: [`127.0.0.1:${sitePort}`],
          imageMaxBytes: 10 * 1024 * 1024,
        },
      });
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/media/")) {
      cleanupCount += 1;
      mediaById.delete(url.pathname.split("/").at(-1));
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === "GET" && url.pathname.startsWith("/mock-media/")) {
      response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store",
      });
      return response.end(onePixelPng);
    }
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = resolve(root, relativePath);
    if (relative(root, filePath).startsWith("..")) throw new Error("非法路径");
    const contents = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(contents);
  } catch (error) {
    sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
  }
});

let chrome;
let cdp;
let userData;

try {
  mark("准备启动测试服务");
  const debugPort = await freePort();
  sitePort = await freePort();
  await new Promise((resolvePromise) => server.listen(sitePort, "127.0.0.1", resolvePromise));
  mark(`测试服务已启动：${sitePort}`);
  userData = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? ".", "zhifan-admin-chrome-"));
  chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userData}`,
    "--window-size=1440,1000",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  mark(`无头 Chrome 已启动：${debugPort}`);

  const targetsResponse = await waitFor(`http://127.0.0.1:${debugPort}/json/list`, (response) => response.ok);
  mark("已连接 Chrome 调试端口");
  const targets = await targetsResponse.json();
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("没有找到 Chrome 调试页面");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });
  mark("调试 WebSocket 已连接");
  cdp = createCdpClient(socket);
  await cdp.send("Page.enable");
  mark("Page 域已启用");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${sitePort}/` });
  mark("已发起后台页面导航");
  await waitForPage(cdp);
  mark("页面已加载");

  const unchangedTextPaste = await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '普通文本');
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  assert.equal(unchangedTextPaste, false, "普通文字粘贴不应被接管");

  const titlePaste = await evaluate(cdp, `(() => {
    const target = document.querySelector('input[name="title"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['title'], 'title.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  assert.equal(titlePaste, false, "标题输入框不应触发图片上传");
  assert.equal(policyCount, 0);
  mark("普通文字与非正文粘贴通过");

  const multiplePrevented = await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    target.value = '开头\\n\\n结尾';
    target.setSelectionRange(4, 4);
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '同时复制的文字不应插入');
    transfer.setData('text/html', '<strong>同时复制的 HTML 不应插入</strong>');
    transfer.items.add(new File(['one'], 'one.png', { type: 'image/png' }));
    transfer.items.add(new File(['two'], 'two.webp', { type: 'image/webp' }));
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  assert.equal(multiplePrevented, true);
  const multiple = await waitForValue(cdp, `(() => {
    const body = document.querySelector('textarea[name="body"]').value;
    const previewImages = document.querySelectorAll('[data-content-preview] img').length;
    if (!body.includes('/mock-media/media-2.png') || previewImages !== 2) return null;
    return {
      body,
      statusCount: document.querySelectorAll('[data-paste-job]').length,
      previewImages,
      mixedTextInserted: body.includes('同时复制'),
    };
  })()`);
  assert.match(multiple.body, /!\[粘贴图片 1\]\(http:\/\/127\.0\.0\.1:\d+\/mock-media\/media-1\.png\)\n\n!\[粘贴图片 2\]\(http:\/\/127\.0\.0\.1:\d+\/mock-media\/media-2\.png\)/);
  assert.equal(multiple.statusCount, 2);
  assert.equal(multiple.previewImages, 2);
  assert.equal(multiple.mixedTextInserted, false);
  mark("多图顺序上传通过");

  await evaluate(cdp, "document.querySelector('[data-article-list] .article-item').click()");
  const beforePlainPolicy = policyCount;
  const plainPaste = await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['plain'], 'plain.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return {
      prevented: event.defaultPrevented,
      format: document.querySelector('input[name="contentFormat"]').value,
      message: document.querySelector('[data-editor-message]').textContent,
    };
  })()`);
  assert.equal(plainPaste.prevented, true);
  assert.equal(plainPaste.format, "plain");
  assert.match(plainPaste.message, /升级为多格式文章/);
  assert.equal(policyCount, beforePlainPolicy);
  mark("纯文本保护通过");

  await evaluate(cdp, "document.querySelector('[data-new-article]').click()");
  await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['late'], 'late.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    target.value = '';
    target.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const readyWithoutPlaceholder = await waitForValue(cdp, `(() => {
    const button = [...document.querySelectorAll('.paste-upload-actions button')].find((item) => item.textContent === '插入正文');
    return button ? { body: document.querySelector('textarea[name="body"]').value, found: true } : null;
  })()`);
  assert.equal(readyWithoutPlaceholder.body, "");
  await evaluate(cdp, `[...document.querySelectorAll('.paste-upload-actions button')].find((item) => item.textContent === '插入正文').click()`);
  const manuallyInserted = await waitForValue(cdp, `document.querySelector('textarea[name="body"]').value.includes('/mock-media/media-3.png')`);
  assert.equal(manuallyInserted, true);
  mark("占位符删除保护通过");

  await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    target.value = '';
    const transfer = new DataTransfer();
    transfer.items.add(new File(['retry'], 'retry.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  })()`);
  await waitForValue(cdp, `[...document.querySelectorAll('.paste-upload-actions .retry')].some((item) => item.closest('[data-paste-job]')?.textContent.includes('retry.png'))`);
  assert.doesNotMatch(await evaluate(cdp, "document.querySelector('textarea[name=\"body\"]').value"), /mock-media/);
  await evaluate(cdp, `[...document.querySelectorAll('.paste-upload-actions .retry')].find((item) => item.closest('[data-paste-job]')?.textContent.includes('retry.png')).click()`);
  const retried = await waitForValue(cdp, `document.querySelector('textarea[name="body"]').value.includes('/mock-media/media-5.png')`);
  assert.equal(retried, true);
  assert.ok(cleanupCount >= 1, "失败上传应尽力清理 pending 记录");
  mark("失败重试与清理通过");

  await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    target.value = '';
    const transfer = new DataTransfer();
    transfer.items.add(new File(['cancel'], 'cancel.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  })()`);
  await waitForValue(cdp, `!document.querySelector('[data-cancel-paste-upload]').hidden`);
  await evaluate(cdp, "document.querySelector('[data-cancel-paste-upload]').click()");
  const cancelled = await waitForValue(cdp, `[...document.querySelectorAll('[data-paste-job]')].some((item) => item.textContent.includes('cancel.png') && item.textContent.includes('上传已取消'))`);
  assert.equal(cancelled, true);
  assert.doesNotMatch(await evaluate(cdp, "document.querySelector('textarea[name=\"body\"]').value"), /mock-media/);
  mark("取消上传通过");

  const beforeOversizePolicy = policyCount;
  const edgeCases = await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    target.value = '';
    const oversizeTransfer = new DataTransfer();
    oversizeTransfer.items.add(new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'oversize.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: oversizeTransfer, bubbles: true, cancelable: true }));
    const oversizeShown = [...document.querySelectorAll('[data-paste-job]')].some((item) => item.textContent.includes('oversize.png') && item.textContent.includes('超过 10 MiB'));
    return { oversizeShown };
  })()`);
  assert.equal(edgeCases.oversizeShown, true);
  assert.equal(policyCount, beforeOversizePolicy);

  await evaluate(cdp, `(() => {
    const target = document.querySelector('textarea[name="body"]');
    target.value = '';
    const transfer = new DataTransfer();
    transfer.items.add(new File(['unnamed'], '', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  })()`);
  const unnamed = await waitForValue(cdp, `(() => {
    const body = document.querySelector('textarea[name="body"]').value;
    const row = [...document.querySelectorAll('[data-paste-job]')].find((item) => item.querySelector('.paste-upload-file strong')?.textContent.startsWith('clipboard-'));
    return body.includes('/mock-media/media-7.png') && row ? {
      body,
      name: row.querySelector('.paste-upload-file strong').textContent,
    } : null;
  })()`);
  assert.match(unnamed.name, /^clipboard-\d{8}-\d{6}-1\.png$/);
  assert.match(unnamed.body, /^!\[粘贴图片\]\(http:\/\/127\.0\.0\.1:\d+\/mock-media\/media-7\.png\)$/);
  mark("超限拦截与无文件名兼容通过");

  console.log(JSON.stringify({
    multiple,
    plainPaste,
    readyWithoutPlaceholder,
    policyCount,
    completeCount,
    cleanupCount,
    cancelled,
    edgeCases,
    unnamed,
  }, null, 2));
} finally {
  if (cdp) {
    try {
      await Promise.race([cdp.send("Browser.close"), delay(2000)]);
    } catch {
      // 页面已经退出时无需重复关闭。
    }
    cdp.close();
  }
  if (chrome && chrome.exitCode === null) {
    await Promise.race([once(chrome, "exit"), delay(5000)]);
    if (chrome.exitCode === null) chrome.kill();
  }
  await new Promise((resolvePromise) => {
    server.close(() => resolvePromise());
    server.closeAllConnections();
  });
  if (userData) await rm(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
