import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteRoot = new URL("../site/", import.meta.url);

test("导出可扩展的知返静态博客与独立文章页", async () => {
  const [html, notFoundHtml, script, articles, articleHtml, articleScript, articleCss, siteCss] = await Promise.all([
    readFile(new URL("index.html", siteRoot), "utf8"),
    readFile(new URL("404.html", siteRoot), "utf8"),
    readFile(new URL("static.js", siteRoot), "utf8"),
    readFile(new URL("articles.json", siteRoot), "utf8").then(JSON.parse),
    readFile(new URL("article.html", siteRoot), "utf8"),
    readFile(new URL("article.js", siteRoot), "utf8"),
    readFile(new URL("article.css", siteRoot), "utf8"),
    readFile(new URL("site.css", siteRoot), "utf8"),
  ]);

  for (const document of [html, notFoundHtml]) {
    assert.match(document, /<title>知返/);
    assert.match(document, /id="latest"/);
    assert.match(document, /href="#latest"/);
    assert.match(document, /data-filter="全部"/);
    assert.match(document, /data-filter="项目经验"/);
    assert.match(document, /data-filter="生活随想"/);
    assert.match(document, /aria-pressed="true"/);
    assert.match(document, /data-load-more/);
    assert.match(document, /\.\/article\.html\?id=/);
    assert.match(document, /<script src="\.\/static\.js" defer><\/script>/);
    assert.match(document, /<strong>02<\/strong><span>个长期栏目<\/span>/);
    assert.equal((document.match(/data-filter=/g) || []).length, 3);
    assert.doesNotMatch(document, /专业经验|项目复盘|关于知返|每月一封/);
    assert.doesNotMatch(document, /id="about"|id="subscribe"|href="#about"|href="#subscribe"|data-subscribe-form/);
    assert.doesNotMatch(document, /三条线索|data-category-trigger|data-article-preview/);
    assert.doesNotMatch(document, /__VINEXT|\.rsc(?:\b|[?"'])|modulepreload/i);
  }

  assert.equal((html.match(/data-article-id=/g) || []).length, 6);
  assert.equal(articles.length, 7);
  assert.ok(articles.every((article) => article.status === "published"));
  assert.deepEqual([...new Set(articles.map((article) => article.category))].sort(), ["生活随想", "项目经验"]);
  assert.ok(articles.filter((article) => article.category === "项目经验").every((article) => article.accent === "mint"));

  assert.match(script, /scrollRestoration\s*=\s*"auto"/);
  assert.match(script, /const pageSize = 6/);
  assert.match(script, /visibleCount \+= pageSize/);
  assert.match(script, /article\.html\?id=/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /fetch\(`\.\/articles\.json/);
  assert.match(script, /category === "项目经验"/);
  assert.doesNotMatch(script, /data-article-preview|data-category-trigger/);
  assert.doesNotMatch(script, /data-subscribe-form/);
  assert.doesNotMatch(script, /addEventListener\(["'](?:wheel|popstate|hashchange)/);

  assert.match(siteCss, /\.card-mint\s*\{/);
  assert.match(siteCss, /\.card-coral\s*\{/);
  assert.match(siteCss, /\.card-sky\s*\{/);
  assert.match(siteCss, /border-top:\s*5px solid var\(--accent-deep\)/);

  assert.match(articleHtml, /data-article/);
  assert.match(articleHtml, /data-body/);
  assert.match(articleHtml, /data-error/);
  assert.match(articleScript, /new URLSearchParams/);
  assert.match(articleScript, /item\.status === "published"/);
  assert.match(articleScript, /textContent = article\.body/);
  assert.match(articleScript, /category === "项目经验"/);
  assert.doesNotMatch(articleScript, /innerHTML/);
  assert.match(articleCss, /white-space:\s*pre-wrap/);
  assert.match(articleCss, /\.reader-article\.accent-coral/);
  assert.match(articleCss, /\.reader-article\.accent-sky/);
});
