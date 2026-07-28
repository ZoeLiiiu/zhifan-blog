import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputRoot = join(root, "site");
const pageSize = 6;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const articleCard = (article, index) => {
  const accent = ["mint", "coral", "sky"].includes(article.accent) ? article.accent : "mint";
  const id = encodeURIComponent(article.id);
  return `<article class="article-card card-${accent}${index === 0 ? " featured" : ""}" data-article-id="${escapeHtml(article.id)}" data-article-category="${escapeHtml(article.category)}" data-article-accent="${accent}">
  <div class="card-topline"><span class="category-dot"><i></i></span><span>${escapeHtml(article.category)}</span><span class="card-date">${escapeHtml(article.date)}</span></div>
  <h3>${escapeHtml(article.title)}</h3>
  <p>${escapeHtml(article.excerpt)}</p>
  <div class="card-footer"><span>${escapeHtml(article.readTime)}</span><a class="read-link" href="./article.html?id=${id}" data-read-article="${escapeHtml(article.id)}" aria-label="阅读：${escapeHtml(article.title)}">阅读全文 <span aria-hidden="true">→</span></a></div>
</article>`;
};

const articleSource = existsSync(join(root, "docs", "articles.json"))
  ? join(root, "docs", "articles.json")
  : join(root, "content", "articles.json");
const allArticles = JSON.parse(await readFile(articleSource, "utf8"));
const articles = allArticles.filter((article) => !article.status || article.status === "published");
const visibleArticles = articles.slice(0, pageSize);
const remainingCount = Math.max(articles.length - visibleArticles.length, 0);

let html = await readFile(join(root, "static", "index.html"), "utf8");
html = html
  .replace("{{ARTICLE_COUNT}}", String(articles.length).padStart(2, "0"))
  .replace("<!-- ARTICLE_CARDS -->", visibleArticles.map(articleCard).join("\n"))
  .replace("{{REMAINING_COUNT}}", String(remainingCount))
  .replace("{{LOAD_MORE_HIDDEN}}", remainingCount ? "" : "hidden");

const css = (await readFile(join(root, "app", "globals.css"), "utf8"))
  .replace(/^@import\s+["']tailwindcss["'];\s*/u, "");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  writeFile(join(outputRoot, "index.html"), html, "utf8"),
  writeFile(join(outputRoot, "404.html"), html, "utf8"),
  writeFile(join(outputRoot, "site.css"), css, "utf8"),
  writeFile(join(outputRoot, ".nojekyll"), "", "utf8"),
  copyFile(articleSource, join(outputRoot, "articles.json")),
  copyFile(join(root, "public", "static.js"), join(outputRoot, "static.js")),
  copyFile(join(root, "public", "article.html"), join(outputRoot, "article.html")),
  copyFile(join(root, "public", "article.css"), join(outputRoot, "article.css")),
  copyFile(join(root, "public", "article.js"), join(outputRoot, "article.js")),
  copyFile(join(root, "public", "favicon.svg"), join(outputRoot, "favicon.svg")),
]);

if (existsSync(join(root, "public", "og.png"))) {
  await copyFile(join(root, "public", "og.png"), join(outputRoot, "og.png"));
}

console.log(`已导出 GitHub Pages 静态站：${articles.length} 篇文章，首屏显示 ${visibleArticles.length} 篇`);
