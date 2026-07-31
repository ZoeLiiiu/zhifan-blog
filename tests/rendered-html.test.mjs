import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteRoot = new URL("../site/", import.meta.url);

test("导出可扩展的知返静态博客与独立文章页", async () => {
  const [html, notFoundHtml, script, articles, articleHtml, articleScript, articleCss, contentCss, contentRenderer, mediaConfig, siteCss, homeSource, exportScript] = await Promise.all([
    readFile(new URL("index.html", siteRoot), "utf8"),
    readFile(new URL("404.html", siteRoot), "utf8"),
    readFile(new URL("static.js", siteRoot), "utf8"),
    readFile(new URL("articles.json", siteRoot), "utf8").then(JSON.parse),
    readFile(new URL("article.html", siteRoot), "utf8"),
    readFile(new URL("article.js", siteRoot), "utf8"),
    readFile(new URL("article.css", siteRoot), "utf8"),
    readFile(new URL("content.css", siteRoot), "utf8"),
    readFile(new URL("content-renderer.js", siteRoot), "utf8"),
    readFile(new URL("media-config.json", siteRoot), "utf8").then(JSON.parse),
    readFile(new URL("site.css", siteRoot), "utf8"),
    readFile(new URL("../app/page.tsx", siteRoot), "utf8"),
    readFile(new URL("../scripts/export-static.mjs", siteRoot), "utf8"),
  ]);

  for (const document of [html, notFoundHtml]) {
    assert.match(document, /<title>知返/);
    assert.match(document, /id="latest"/);
    assert.match(document, /href="#latest"/);
    assert.match(document, /data-filter="全部"/);
    assert.match(document, /data-filter="项目经验"/);
    assert.match(document, /data-filter="生活随想"/);
    assert.match(document, /aria-pressed="true"/);
    assert.match(document, /<h1>来煎<em>人寿<\/em><\/h1>/);
    assert.match(document, /data-article-search/);
    assert.match(document, /data-article-search-shell/);
    assert.match(document, /data-search-clear/);
    assert.match(document, /data-search-status/);
    assert.match(document, /aria-live="polite"/);
    assert.match(document, /data-load-more/);
    assert.match(document, /\.\/article\.html\?id=/);
    assert.match(document, /<script src="\.\/static\.js" defer><\/script>/);
    assert.match(document, /<strong>02<\/strong><span>个长期栏目<\/span>/);
    assert.equal((document.match(/data-filter=/g) || []).length, 3);
    assert.doesNotMatch(document, /专业经验|项目复盘|关于知返|每月一封/);
    assert.doesNotMatch(document, /id="about"|id="subscribe"|href="#about"|href="#subscribe"|data-subscribe-form/);
    assert.doesNotMatch(document, /三条线索|data-category-trigger|data-article-preview/);
    assert.doesNotMatch(document, /知道自己|要回到哪里/);
    assert.doesNotMatch(document, /__VINEXT|\.rsc(?:\b|[?"'])|modulepreload/i);
  }

  assert.equal((html.match(/data-article-id=/g) || []).length, Math.min(articles.length, 6));
  assert.ok(articles.length > 0);
  assert.ok(articles.every((article) => article.status === "published"));
  assert.ok(articles.every((article) => ["plain", "markdown"].includes(article.contentFormat)));
  assert.ok(articles.some((article) => article.contentFormat === "plain"));
  assert.ok(articles.some((article) => article.contentFormat === "markdown"));
  assert.deepEqual([...new Set(articles.map((article) => article.category))].sort(), ["生活随想", "项目经验"]);
  assert.ok(articles.filter((article) => article.category === "项目经验").every((article) => article.accent === "mint"));
  assert.ok(articles.filter((article) => article.category === "生活随想").every((article) => article.accent === "sky"));

  assert.match(script, /scrollRestoration\s*=\s*"auto"/);
  assert.match(script, /const pageSize = 6/);
  assert.match(script, /const searchDelay = 120/);
  assert.match(script, /const snippetLength = 118/);
  assert.match(script, /const snippetContext = 38/);
  assert.match(script, /visibleCount \+= pageSize/);
  assert.match(script, /article\.html\?id=/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /fetch\(`\.\/articles\.json/);
  assert.match(script, /category === "生活随想" \? "sky" : "mint"/);
  assert.match(script, /\.normalize\("NFKC"\)/);
  assert.match(script, /\.every\(\(term\) =>/);
  assert.match(script, /protectMarkdownCode/);
  assert.match(script, /codeSegments/);
  assert.match(script, /createBodySnippet/);
  assert.match(script, /document\.createTextNode/);
  assert.match(script, /createElement\("mark"/);
  assert.match(script, /searchStatus\.textContent/);
  assert.doesNotMatch(script, /data-article-preview|data-category-trigger/);
  assert.doesNotMatch(script, /data-subscribe-form/);
  assert.doesNotMatch(script, /!article\.status/);
  assert.doesNotMatch(script, /replace\(\/<\[\^>\]\*>\//);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(script, /addEventListener\(["'](?:wheel|popstate|hashchange)/);

  assert.match(siteCss, /\.article-search\s*\{/);
  assert.match(siteCss, /\.search-field\s*\{/);
  assert.match(siteCss, /\.article-card mark\s*\{/);
  assert.match(siteCss, /\.card-mint\s*\{/);
  assert.match(siteCss, /\.card-coral\s*\{/);
  assert.match(siteCss, /\.card-sky\s*\{/);
  assert.match(siteCss, /border-top:\s*5px solid var\(--accent-deep\)/);

  assert.match(homeSource, /const snippetLength = 118/);
  assert.match(homeSource, /const snippetContext = 38/);
  assert.match(homeSource, /protectMarkdownCode/);
  assert.match(homeSource, /codeSegments/);
  assert.doesNotMatch(homeSource, /replace\(\/<\[\^>\]\*>\//);
  assert.match(exportScript, /article\.status === "published"/);
  assert.match(exportScript, /JSON\.stringify\(articles, null, 2\)/);
  assert.doesNotMatch(exportScript, /JSON\.stringify\(allArticles, null, 2\)/);

  assert.match(articleHtml, /data-article/);
  assert.match(articleHtml, /data-body/);
  assert.match(articleHtml, /data-error/);
  assert.match(articleHtml, /content-renderer\.js/);
  assert.match(articleHtml, /content\.css/);
  assert.match(articleHtml, /Content-Security-Policy/);
  assert.match(articleHtml, /frame-src 'none'/);
  for (const host of mediaConfig.allowedHosts) {
    assert.match(articleHtml, new RegExp(`connect-src[^;]*https://${host.replaceAll(".", "\\.")}`));
    assert.match(articleHtml, new RegExp(`img-src[^;]*https://${host.replaceAll(".", "\\.")}`));
    assert.match(articleHtml, new RegExp(`media-src[^;]*https://${host.replaceAll(".", "\\.")}`));
  }
  assert.match(articleHtml, /img-src 'self' blob:/);
  assert.match(articleScript, /new URLSearchParams/);
  assert.match(articleScript, /item\.status === "published"/);
  assert.match(articleScript, /ZhifanContent\.renderContent/);
  assert.match(articleScript, /media-config\.json/);
  assert.match(articleScript, /category === "项目经验"/);
  assert.doesNotMatch(articleScript, /innerHTML/);
  assert.match(contentCss, /\.rich-content\.is-plain/);
  assert.match(contentCss, /white-space:\s*pre-wrap/);
  assert.match(contentCss, /\.content-code-block/);
  assert.match(contentCss, /\.content-video/);
  assert.match(contentRenderer, /DOMPurify/);
  assert.match(contentRenderer, /javascript:/);
  assert.match(contentRenderer, /ZhifanContent/);
  assert.match(contentRenderer, /credentials:"omit",mode:"cors"/);
  assert.match(contentRenderer, /URL\.createObjectURL\(/);
  assert.ok(Array.isArray(mediaConfig.allowedHosts));
  assert.match(articleCss, /\.reader-article\.accent-coral/);
  assert.match(articleCss, /\.reader-article\.accent-sky/);
});
