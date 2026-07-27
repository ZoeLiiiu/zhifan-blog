import { chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { requireAdminUser } from "@/lib/admin-auth";
import AdminClient from "@/app/admin/admin-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdminUser("/admin");

  if (!user) {
    return (
      <main className="admin-denied">
        <div className="admin-denied-card">
          <p className="eyebrow"><span /> 知返管理后台</p>
          <h1>这个账号还没有管理权限。</h1>
          <p>请使用站点所有者账号登录，或联系管理员把你的邮箱加入后台名单。</p>
          <Link className="button button-primary" href="/">回到博客</Link>
        </div>
      </main>
    );
  }

  return <AdminClient user={user} signOutPath={chatGPTSignOutPath("/admin")} />;
}
