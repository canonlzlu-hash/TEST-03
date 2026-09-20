import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "翌帆气膜 · 控制系统工作台",
  description: "可拖动的气膜平面布局、多风机顺序联动与门漏气模拟工作台",
  other: {
    "codex-preview": "development",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
