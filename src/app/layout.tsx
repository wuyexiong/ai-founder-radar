import type { Metadata } from "next";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import "./globals.css";

export const metadata: Metadata = {
  title: "IndieRadar — 出海搞钱与产品灵感雷达 | 每日 5 分钟全球 AI & SaaS 商业信号",
  description:
    "每日自动扫描 Product Hunt、Reddit 独立开发版块、Show HN 与真实 MRR 榜单，提炼『它是什么、怎么赚钱、如何抄作业』的高信噪比中文商业卡片。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        {children}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
