import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知返 · 一个慢慢写下来的角落",
  description: "记录专业经验、项目复盘与生活随想。让走过的路，留下可以回看的光。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
