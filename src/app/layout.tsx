import type { Metadata, Viewport } from "next";
import PwaRegistrar from "@/components/common/PwaRegistrar";
import "./globals.css";
import "./cinematic.css";

// 子路径部署（例如 /index-boundary）由构建期环境变量注入。
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const asset = (path: string) => `${BASE}${path}`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://amtopa.com";

const TITLE = "指数边界 Boundless Exponent";
const DESCRIPTION = "数值膨胀 / 放置 / 构筑 Web 游戏：突破更高关卡的异常数据体，用升级、装备、技能、天赋、重构与世界跃迁构筑自己的增长引擎。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "指数边界",
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
    url: asset("/") || "/",
    siteName: "指数边界",
    type: "website",
    locale: "zh_CN",
    images: [{ url: asset("/og-image.png"), width: 1200, height: 630, alt: TITLE }],
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
  themeColor: "#060a14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}
