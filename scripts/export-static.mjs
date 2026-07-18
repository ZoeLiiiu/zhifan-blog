import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const buildRoot = join(root, "dist");
const clientRoot = join(buildRoot, "client");
const outputRoot = join(root, "site");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "assets"), { recursive: true });

const worker = (await import(`${pathToFileURL(join(buildRoot, "server", "index.js")).href}?static=${Date.now()}`)).default;
const response = await worker.fetch(
  new Request("http://localhost/"),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) {
  throw new Error(`静态导出失败：服务端返回 ${response.status}`);
}

let html = await response.text();
// GitHub Pages 的项目站点位于子路径；使用相对资源路径，兼容用户仓库名和用户名站点。
html = html
  .replaceAll('href="/assets/', 'href="./assets/')
  .replaceAll('src="/assets/', 'src="./assets/')
  .replaceAll('"/assets/', '"./assets/')
  .replaceAll("'/assets/", "'./assets/")
  .replaceAll('href="/favicon.svg', 'href="./favicon.svg')
  .replaceAll('src="/favicon.svg', 'src="./favicon.svg')
  .replaceAll('"/favicon.svg', '"./favicon.svg');

await writeFile(join(outputRoot, "index.html"), html, "utf8");
await writeFile(join(outputRoot, "404.html"), html, "utf8");
await writeFile(join(outputRoot, ".nojekyll"), "", "utf8");
await cp(join(clientRoot, "assets"), join(outputRoot, "assets"), { recursive: true });
await cp(join(clientRoot, "favicon.svg"), join(outputRoot, "favicon.svg"));

const title = (await readFile(join(outputRoot, "index.html"), "utf8")).match(/<title>(.*?)<\/title>/i)?.[1] ?? "知返";
console.log(`已导出 GitHub Pages 静态站：${title}`);
