// SSR 冒烟：构建后启动 next start，抓取首页/清单/图标，验证 200 与关键内容
// 未构建时给出提示并以 0 退出（build 由 CI 前置执行）
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const PORT = process.env.SSR_PORT ? Number(process.env.SSR_PORT) : 3100;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ROOT = process.cwd();

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {
      // 尚未就绪
    }
    await sleep(400);
  }
  return false;
}

async function main(): Promise<void> {
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    console.log("SSR 冒烟跳过：尚未构建（请先运行 npm run build）");
    return;
  }

  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child: ChildProcess = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_BASE_PATH: BASE },
  });

  const root = `http://127.0.0.1:${PORT}${BASE}`;
  let failed = false;
  try {
    if (!(await waitForServer(root, 30000))) {
      console.error(`✗ 服务器未就绪: ${root}`);
      failed = true;
    } else {
      const res = await fetch(root);
      const html = await res.text();
      console.log(`✓ 首页 ${res.status} (${html.length} bytes)`);
      if (res.status !== 200 || !html.includes("指数边界")) {
        console.error(`✗ 首页内容异常（缺少「指数边界」）`);
        failed = true;
      }
      for (const p of ["/manifest.json", "/icon.svg"]) {
        const r = await fetch(`${root}${p}`);
        console.log(`✓ ${p} ${r.status}`);
        if (r.status !== 200) failed = true;
      }
    }
  } finally {
    child.kill();
  }
  if (failed) { console.error("SSR 冒烟失败"); process.exit(1); }
  console.log("SSR 冒烟通过 ✓");
}

main().catch((e) => { console.error(e); process.exit(1); });