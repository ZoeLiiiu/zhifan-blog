import { cp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "site");
const target = join(root, "docs");
const [html, articles] = await Promise.all([
  readFile(join(source, "index.html"), "utf8"),
  readFile(join(source, "articles.json"), "utf8").then(JSON.parse),
]);

if (!html.includes('id="latest"') || !html.includes("./article.html?id=")) {
  throw new Error("拒绝同步：静态首页尚未通过结构检查");
}
if (
  !html.includes('data-filter="项目经验"') ||
  !html.includes('data-filter="生活随想"') ||
  html.includes('data-filter="专业经验"') ||
  html.includes('data-filter="项目复盘"') ||
  html.includes('id="about"') ||
  html.includes('id="subscribe"')
) {
  throw new Error("拒绝同步：栏目合并或页面精简尚未完成");
}
if (!Array.isArray(articles) || !articles.length) {
  throw new Error("拒绝同步：文章数据为空");
}
if (articles.some((article) => !["项目经验", "生活随想"].includes(article.category))) {
  throw new Error("拒绝同步：文章仍包含旧分类");
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`已同步 GitHub Pages 发布目录：${articles.length} 篇文章`);
