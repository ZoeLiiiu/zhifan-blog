import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function waitForServer(baseUrl, child, output) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`管理后台提前退出：${child.exitCode}\n${output.text}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 服务进程仍在启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("等待管理后台启动超时");
}

test("ECS 后台通过 IMDSv2 获取并缓存 RAM 角色临时凭证", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "zhifan-ram-role-"));
  const dataFile = join(directory, "articles.json");
  const mediaFile = join(directory, "media.json");
  const password = "仅用于 RAM 角色测试的密码-2026";
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  const passwordHash = `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
  await writeFile(dataFile, "[]\n", "utf8");

  const calls = [];
  const metadataServer = createServer((request, response) => {
    calls.push({
      method: request.method,
      url: request.url,
      token: request.headers["x-aliyun-ecs-metadata-token"] || "",
    });
    if (request.url === "/latest/api/token" && request.method === "PUT") {
      assert.equal(request.headers["x-aliyun-ecs-metadata-token-ttl-seconds"], "21600");
      response.end("imds-v2-test-token");
      return;
    }
    assert.equal(request.headers["x-aliyun-ecs-metadata-token"], "imds-v2-test-token");
    if (request.url === "/latest/meta-data/ram/security-credentials/") {
      response.end("ZhifanBlogEcsRole");
      return;
    }
    if (request.url === "/latest/meta-data/ram/security-credentials/ZhifanBlogEcsRole") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        Code: "Success",
        AccessKeyId: "STS.test-access-key",
        AccessKeySecret: "test-secret",
        SecurityToken: "test-security-token",
        Expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const metadataPort = await listen(metadataServer);

  const probeServer = createServer();
  const appPort = await listen(probeServer);
  await new Promise((resolve) => probeServer.close(resolve));

  const child = spawn(process.execPath, [fileURLToPath(new URL("../ecs-admin/server.mjs", import.meta.url))], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      DATA_FILE: dataFile,
      MEDIA_FILE: mediaFile,
      ADMIN_USERNAME: "zhifan",
      ADMIN_PASSWORD_HASH: passwordHash,
      OSS_BUCKET: "zhifan-blog",
      OSS_ENDPOINT: "oss-cn-guangzhou.aliyuncs.com",
      OSS_PUBLIC_BASE_URL: "https://zhifan-blog.oss-cn-guangzhou.aliyuncs.com",
      OSS_USE_ECS_RAM_ROLE: "true",
      OSS_ECS_METADATA_BASE_URL: `http://127.0.0.1:${metadataPort}/latest`,
      OSS_ACCESS_KEY_ID: "",
      OSS_ACCESS_KEY_SECRET: "",
      OSS_SECURITY_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { text: "" };
  child.stdout.on("data", (chunk) => { output.text += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output.text += chunk.toString(); });
  context.after(async () => {
    child.kill();
    await new Promise((resolve) => metadataServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${appPort}`;
  await waitForServer(baseUrl, child, output);
  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "zhifan", password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];

  const library = await fetch(`${baseUrl}/api/media`, {
    headers: { Cookie: cookie },
  }).then((response) => response.json());
  assert.equal(library.config.enabled, true);

  const requestPolicy = () => fetch(`${baseUrl}/api/media/policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      kind: "image",
      name: "role-test.png",
      mime: "image/png",
      size: 1024,
    }),
  });

  const first = await requestPolicy();
  assert.equal(first.status, 201);
  const firstPayload = await first.json();
  assert.equal(firstPayload.fields.OSSAccessKeyId, "STS.test-access-key");
  assert.equal(firstPayload.fields["x-oss-security-token"], "test-security-token");
  assert.ok(firstPayload.fields.Signature);

  const second = await requestPolicy();
  assert.equal(second.status, 201);
  assert.equal(calls.filter((call) => call.url === "/latest/api/token").length, 1);
  assert.equal(calls.length, 3);
});
