import type { Metadata, Viewport } from "next";
import "./globals.css";

// basePath（部署到子路径时由构建期环境变量注入），静态资源路径需手动加前缀
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const asset = (p: string) => `${BASE}${p}`;

const TITLE = "指数边界 Boundless Exponent";
const DESCRIPTION = "数值膨胀 / 放置 / 构筑 Web 游戏：突破更高关卡的异常数据体，用升级、装备、技能、天赋、重构与世界跳跃构筑自己的增长引擎。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: asset("/manifest.json"),
  icons: {
    icon: [
      { url: asset("/favicon.ico"), sizes: "any", type: "image/x-icon" },
      { url: asset("/favicon.svg"), type: "image/svg+xml" },
      { url: asset("/favicon-16x16.png"), sizes: "16x16", type: "image/png" },
      { url: asset("/favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: asset("/favicon-48x48.png"), sizes: "48x48", type: "image/png" },
      { url: asset("/favicon-96x96.png"), sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: asset("/apple-touch-icon.png"), sizes: "180x180" }],
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://amtopa.com/index-boundary",
    siteName: "指数边界",
    type: "website",
    locale: "zh_CN",
    images: [{ url: asset("/og-image.png"), width: 1200, height: 630, alt: "指数边界 Boundless Exponent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [asset("/og-image.png")],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#060a14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}