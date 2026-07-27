import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import {
  chatGPTSignInPath,
  getChatGPTUser,
  type ChatGPTUser,
} from "@/app/chatgpt-auth";

function adminEmails() {
  const runtimeEnv = env as unknown as { ADMIN_EMAILS?: string };
  return (runtimeEnv.ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  const allowed = adminEmails();
  return allowed.length > 0 && allowed.includes(email.trim().toLowerCase());
}

export async function getAdminUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function requireAdminUser(returnTo = "/admin") {
  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath(returnTo));
  if (!isAdminEmail(user.email)) return null;
  return user;
}

export async function authorizeAdminRequest() {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      user: null,
      response: Response.json({ error: "请先登录后再管理文章" }, { status: 401 }),
    };
  }
  if (!isAdminEmail(user.email)) {
    return {
      user: null,
      response: Response.json({ error: "当前账号没有后台权限" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export function validateMutationRequest(
  request: Request,
  options: { json?: boolean } = {},
) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let refererOrigin: string | null = null;
  if (referer) {
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      return Response.json({ error: "请求来源不受信任" }, { status: 403 });
    }
  }
  if ((origin && origin !== requestOrigin) || (refererOrigin && refererOrigin !== requestOrigin)) {
    return Response.json({ error: "请求来源不受信任" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 200_000) {
    return Response.json({ error: "文章内容过大" }, { status: 413 });
  }
  if (options.json && !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "请求必须使用 JSON" }, { status: 415 });
  }
  return null;
}
