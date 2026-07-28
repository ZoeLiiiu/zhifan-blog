import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://zoeliiiu.github.io/zhifan-blog/"),
  title: "知返 · 一个慢慢写下来的角落",
  description: "记录项目经验与生活随想。让走过的路，留下可以回看的光。",
  openGraph: {
    title: "知返 · 一个慢慢写下来的角落",
    description: "记录项目经验与生活随想。让走过的路，留下可以回看的光。",
    type: "website",
    images: [{ url: "/zhifan-blog/og.png", width: 1200, height: 630, alt: "知返博客" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "知返 · 一个慢慢写下来的角落",
    description: "记录项目经验与生活随想。让走过的路，留下可以回看的光。",
    images: ["/zhifan-blog/og.png"],
  },
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
