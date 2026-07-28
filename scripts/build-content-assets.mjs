import { copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const temporaryOutput = join(root, "node_modules", ".cache", "zhifan-content-assets");
const browserTargets = [
  join(root, "public"),
  join(root, "ecs-admin", "public"),
];

await rm(temporaryOutput, { recursive: true, force: true });

await build({
  configFile: false,
  logLevel: "warn",
  build: {
    emptyOutDir: true,
    lib: {
      entry: join(root, "shared", "content-renderer.js"),
      formats: ["iife"],
      name: "ZhifanContentBundle",
      fileName: () => "content-renderer.js",
    },
    minify: "esbuild",
    outDir: temporaryOutput,
    sourcemap: false,
    target: "es2022",
  },
});

for (const target of browserTargets) {
  await mkdir(target, { recursive: true });
  await Promise.all([
    copyFile(join(temporaryOutput, "content-renderer.js"), join(target, "content-renderer.js")),
    copyFile(join(root, "shared", "content.css"), join(target, "content.css")),
    ...(target === join(root, "public")
      ? [copyFile(join(root, "content", "media-config.json"), join(target, "media-config.json"))]
      : []),
  ]);
}

await rm(temporaryOutput, { recursive: true, force: true });
console.log("多格式文章资源已构建。");
