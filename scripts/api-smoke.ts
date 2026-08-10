// 云层冒烟：启动 standalone 服务器，验证 注册/登录/会话/云存档上传下载/排行榜提交/登出隔离/未登录拒绝/幂等
// 需要先 npm run build；独立临时 DB，不污染开发数据。
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PORT = Number(process.env.API_PORT ?? 3189);
const ROOT = process.cwd();
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

// 手动递归拷贝（Node 25 的 fs.cpSync 在本机触发原生崩溃，故自实现）
function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

async function waitServer(url: string, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const res = await fetch(url); if (res.status === 200) return true; } catch { /* not ready */ }
    await sleep(400);
  }
  return false;
}

let failed = false;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) console.log(`  ✓ ${name}${extra ? ` (${extra})` : ""}`);
  else { console.error(`  ✗ ${name}${extra ? ` (${extra})` : ""}`); failed = true; }
}

async function post(url: string, body: unknown, cookie?: string): Promise<{ status: number; json: any; setCookie?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") ?? undefined };
}

async function get(url: string, cookie?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main(): Promise<void> {
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) { console.log("API 冒烟跳过：尚未构建（请先 npm run build）"); return; }

  const standalone = path.join(ROOT, ".next", "standalone");
  fs.mkdirSync(path.join(standalone, ".next"), { recursive: true });
  copyDir(path.join(ROOT, ".next", "static"), path.join(standalone, ".next", "static"));
  copyDir(path.join(ROOT, "public"), path.join(standalone, "public"));
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "ib-api-smoke-"));

  const child: ChildProcess = spawn(process.execPath, [path.join(standalone, "server.js")], {
    cwd: standalone,
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", IB_DB_PATH: path.join(dbDir, "api.db") },
  });

  try {
    if (!(await waitServer(BASE, 30000))) { console.error("✗ 服务器未就绪"); failed = true; return; }

    const user = `smoke_${Date.now().toString(36)}`;
    const pw = "test123456";

    const reg = await post(`${BASE}/api/auth/register`, { username: user, password: pw });
    check("注册", reg.status === 200 && reg.json.ok === true && reg.json.user.username === user);

    const login = await post(`${BASE}/api/auth/login`, { username: user, password: pw });
    const cookie = login.setCookie?.split(";")[0] ?? "";
    check("登录拿到会话 Cookie", login.status === 200 && cookie.startsWith("ib_session="));

    const me = await get(`${BASE}/api/auth/me`, cookie);
    check("me 会话", me.status === 200 && me.json.user?.username === user);

    const now = Date.now();
    const savePayload = { format: "index-boundary-save", version: 1, timestamp: now, checksum: "00000000", state: { combat: { stage: 123 } } };
    const up = await fetch(`${BASE}/api/save`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ save: savePayload, clientUpdatedAt: now }),
    });
    const upJson = await up.json().catch(() => ({}));
    check("上传云存档", up.status === 200 && upJson.ok === true);

    const down = await get(`${BASE}/api/save`, cookie);
    check("下载云存档", down.status === 200 && down.json.save?.state?.combat?.stage === 123, `stage=${down.json.save?.state?.combat?.stage}`);

    const runId = `ib_${Date.now().toString(36)}_stage`;
    const score = await post(`${BASE}/api/leaderboard`, { runId, runValue: 123, depth: 123, kind: "stage" }, cookie);
    check("提交成绩", score.status === 200 && score.json.ok === true && score.json.best?.best_value === 123);

    const lb = await get(`${BASE}/api/leaderboard?kind=stage&limit=10`, cookie);
    const found = (lb.json.list ?? []).some((r: any) => r.username === user);
    check("排行榜可见", found && lb.json.me?.best_value === 123);

    const dup = await post(`${BASE}/api/leaderboard`, { runId, runValue: 123, depth: 123, kind: "stage" }, cookie);
    check("重复 runId 幂等", dup.status === 200 && dup.json.best?.best_value === 123);

    const bad = await post(`${BASE}/api/leaderboard`, { runId: "short", runValue: 1, depth: 1, kind: "stage" }, cookie);
    check("runId 校验", bad.status === 400);

    await post(`${BASE}/api/auth/logout`, {}, cookie);
    const after = await get(`${BASE}/api/save`, cookie);
    check("登出后云存档隔离", after.json.save === null);

    const anon = await post(`${BASE}/api/leaderboard`, { runId: "ib_anon_12345678", runValue: 1, depth: 1, kind: "stage" });
    check("未登录提交被拒", anon.status === 401);
  } finally {
    child.kill();
  }

  if (failed) { console.error("API 冒烟失败"); process.exit(1); }
  console.log("API 冒烟通过 ✓");
}

main().catch((e) => { console.error(e); process.exit(1); });