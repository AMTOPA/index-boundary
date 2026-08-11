import { spawn } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next", "standalone");
const SERVER = path.join(STANDALONE, "server.js");

function assertInsideStandalone(target) {
  const relative = path.relative(STANDALONE, path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`拒绝写入 standalone 目录之外：${target}`);
  }
}

function copyDirectory(source, destination) {
  assertInsideStandalone(destination);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry);
    const to = path.join(destination, entry);
    const stat = lstatSync(from);
    if (stat.isDirectory()) copyDirectory(from, to);
    else if (stat.isSymbolicLink()) symlinkSync(readlinkSync(from), to, process.platform === "win32" ? "junction" : undefined);
    else copyFileSync(from, to);
  }
}

function cliPort(args) {
  const index = args.findIndex((arg) => arg === "-p" || arg === "--port");
  return index >= 0 ? args[index + 1] : undefined;
}

if (!existsSync(SERVER)) {
  console.error("未找到 .next/standalone/server.js，请先运行 npm run build。");
  process.exit(1);
}

const publicSource = path.join(ROOT, "public");
const staticSource = path.join(ROOT, ".next", "static");
for (const [label, source] of [["public", publicSource], [".next/static", staticSource]]) {
  if (!existsSync(source)) {
    console.error(`Missing ${label}; run npm run build before starting standalone mode.`);
    process.exit(1);
  }
}
copyDirectory(publicSource, path.join(STANDALONE, "public"));
copyDirectory(staticSource, path.join(STANDALONE, ".next", "static"));

const child = spawn(process.execPath, [SERVER], {
  cwd: STANDALONE,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    PORT: cliPort(process.argv.slice(2)) || process.env.PORT || "3000",
    // server.js runs inside .next/standalone; keep persistent data outside the disposable .next directory.
    IB_DB_PATH: process.env.IB_DB_PATH || path.join(ROOT, "data", "game.db"),
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
child.on("error", (error) => {
  console.error("standalone 服务启动失败：", error);
  process.exit(1);
});
