import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteRoot = new URL("../site/", import.meta.url);

test("导出可直接发布的知返静态博客", async () => {
  const [html, notFoundHtml, script] = await Promise.all([
    readFile(new URL("index.html", siteRoot), "utf8"),
    readFile(new URL("404.html", siteRoot), "utf8"),
    readFile(new URL("static.js", siteRoot), "utf8"),
  ]);

  for (const document of [html, notFoundHtml]) {
    assert.match(document, /<title>知返/);
    assert.match(document, /id="latest"/);
    assert.match(document, /id="about"/);
    assert.match(document, /href="#latest"/);
    assert.match(document, /href="#about"/);
    assert.match(document, /data-filter="全部"/);
    assert.match(document, /data-article-preview/);
    assert.match(document, /<script src="\.\/static\.js" defer><\/script>/);
    assert.doesNotMatch(document, /__VINEXT|\.rsc(?:\b|[?"'])|modulepreload|scrollRestoration/i);
  }

  assert.match(script, /scrollRestoration\s*=\s*"auto"/);
  assert.match(script, /scrollIntoView/);
  assert.match(script, /data-read-article/);
  assert.doesNotMatch(script, /addEventListener\(["'](?:wheel|popstate|hashchange)/);
});
