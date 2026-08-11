import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? `：${detail}` : ""}`);
    failed = true;
  }
}

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8").replace(/^\uFEFF/, "");
}

const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
const manifest = JSON.parse(read("public/manifest.json")) as {
  start_url?: string;
  scope?: string;
  display?: string;
  icons?: Array<{ src?: string; sizes?: string }>;
};
const layout = read("src/app/layout.tsx");
const nextConfig = read("next.config.mjs");
const registrar = read("src/components/common/PwaRegistrar.tsx");
const serviceWorker = read("public/sw.js");
const css = read("src/app/globals.css");
const auth = read("src/lib/auth.ts");
const page = read("src/app/page.tsx");
const prestigePanel = read("src/components/prestige/PrestigePanel.tsx");
const engine = read("src/game/engine.ts");
const starfield = read("src/components/combat/Starfield.tsx");
const particles = read("src/components/combat/CombatParticles.tsx");

check("metadataBase 已配置", layout.includes("metadataBase: new URL("));
check("PWA 注册器挂载到根布局", layout.includes("<PwaRegistrar />"));
check("Service Worker 仅在生产环境注册", registrar.includes('process.env.NODE_ENV !== "production"'));
check("Service Worker 支持子路径 scope", registrar.includes("NEXT_PUBLIC_BASE_PATH") && serviceWorker.includes("self.registration.scope"));
check("Service Worker 排除 API/私有数据", serviceWorker.includes('relativePath.startsWith("/api/")'));
check("Service Worker 有离线导航回退", serviceWorker.includes("networkFirstNavigation") && serviceWorker.includes("cache.match(scoped(\"/\"))"));
check("PWA shell install requires cached root", serviceWorker.includes("await cache.add(scoped(\"/\"))"));

check("manifest 使用 standalone 展示", manifest.display === "standalone");
check("manifest 的 start_url/scope 可适配子路径", manifest.start_url === "." && manifest.scope === ".");
check("manifest 至少提供 192/512 图标", Boolean(
  manifest.icons?.some((icon) => icon.sizes === "192x192")
  && manifest.icons?.some((icon) => icon.sizes === "512x512"),
));
for (const icon of manifest.icons ?? []) {
  if (!icon.src) continue;
  check(`manifest 图标存在 (${icon.src})`, fs.existsSync(path.join(root, "public", icon.src)));
}

check("Next 使用 standalone 输出", /output:\s*["']standalone["']/.test(nextConfig));
check("Next 支持 NEXT_PUBLIC_BASE_PATH", nextConfig.includes("NEXT_PUBLIC_BASE_PATH"));
check("Service Worker 禁止长期 HTTP 缓存", nextConfig.includes("no-cache, no-store, must-revalidate"));
check("Next 隐藏框架标识并设置基础安全响应头", nextConfig.includes("poweredByHeader: false") && nextConfig.includes("X-Content-Type-Options"));
check("npm start 使用 standalone 启动器", pkg.scripts?.start === "node scripts/start-standalone.mjs");
check("No incompatible next start script", !Object.values(pkg.scripts ?? {}).includes("next start"));
const standaloneStarter = read("scripts/start-standalone.mjs");
check("Standalone DB stays outside .next", standaloneStarter.includes('path.join(ROOT, "data", "game.db")'));
check("Standalone requires complete static assets", standaloneStarter.includes("publicSource") && standaloneStarter.includes("staticSource") && standaloneStarter.includes("process.exit(1)"));
check("质量验收脚本已接入", pkg.scripts?.["test:quality"] === "tsx scripts/quality-accept.ts");

check("viewport 使用设备宽度", layout.includes('width: "device-width"'));
check("CSS 有移动端断点", /@media\s*\([^)]*max-width\s*:\s*\d+px/.test(css));
check("页面阻止根级横向溢出", /overflow-x\s*:\s*hidden/.test(css));
check("CSS 响应系统减弱动效设置", css.includes("prefers-reduced-motion"));


check("主分页统一为底部四入口", page.includes('type MainTab = "combat" | "upgrades" | "skills" | "systems"') && page.includes('className="bottom-nav"'));
check("非当前主分页不会继续挂载", page.includes('{view === "combat" && (') && page.includes('{view === "upgrades" && (') && page.includes('{view === "skills" && ('));
check("未解锁功能使用锁与问号", page.includes('locked ? "🔒"') && page.includes('locked ? "???"') && prestigePanel.includes('"🔒 ???"'));
check("五项基础升级受当前关卡硬上限", engine.includes("remainingLevels") && engine.includes("upgradeMaxLevel(_id: UpgradeId)"));
check("星空降频并可在非战斗页暂停", starfield.includes("1_000 / 24") && starfield.includes("active?: boolean"));
check("战斗粒子已限制帧率和数量", particles.includes("MAX_PARTICLES = 80") && particles.includes("FRAME_INTERVAL_MS = 1_000 / 30"));
check("解锁提示具备可读背景和水波纹", css.includes("unlockRipple") && css.includes(".unlock-inner::before"));

check("生产会话 Cookie 启用 secure", auth.includes('secure: process.env.NODE_ENV === "production"'));
check("认证包含 IP 与用户名限流", auth.includes(":ip:") && auth.includes(":username:"));

if (failed) process.exit(1);
console.log("静态 / 响应式 / PWA / 安全配置验收通过 ✓");
