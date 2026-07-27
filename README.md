# 知返

知返是一个简约的小型个人博客，记录专业经验、项目复盘与生活随想。
公开博客由 GitHub Pages 托管；私有管理后台运行在 ECS 上，并保留
Sites/Cloudflare Worker 版本作为兼容部署。

## Prerequisites

- Node.js `>=22.13.0`

## 本地开发

```bash
npm install
npm run dev
npm run build
```

首次使用 D1 时运行 `npm run db:generate` 生成迁移。管理后台地址为 `/admin`，
需要 Sites 注入的 ChatGPT 登录身份，并将管理员邮箱配置到 `ADMIN_EMAILS`。

原有 Sites 后台仍可作为兼容版本使用；日常文章管理以 ECS 私有后台为准。

## ECS 私有后台与免费公开发布

不购买域名时，公开博客继续由 GitHub Pages 免费托管，ECS 只运行绑定在
`127.0.0.1:3210` 的私有管理后台。管理员通过 SSH 加密通道访问后台；每次保存、
发布、归档或删除文章后，后台会把公开文章写入 `docs/articles.json` 并推送到
GitHub，GitHub Pages 随后自动更新。

本地打开后台：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-ecs-admin.ps1
```

保持终端窗口开启，然后访问 `http://127.0.0.1:3210`。登录信息保存在本地忽略文件
`.ecs-admin-login.txt` 中，不会提交到 GitHub。

## 功能

- `/admin`：登录保护的文章管理后台
- `/api/articles`：公开文章接口，只返回已发布内容
- `/api/admin/articles`：管理员 CRUD 接口
- `db/schema.ts` 与 `drizzle/`：文章表和 D1 迁移
- `.openai/hosting.json`：声明 `DB` D1 绑定

## 身份与权限

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Sites 登录

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## 常用命令

- `npm run dev`：启动本地开发
- `npm run build`：构建 Sites Worker
- `npm test`：构建并检查静态镜像
- `npm run lint`：运行代码检查
- `npm run db:generate`：生成 D1 迁移

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
