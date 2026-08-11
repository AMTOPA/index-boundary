import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
if (!fs.existsSync(path.join(root, ".next", "standalone", "server.js"))) {
  console.log("standalone smoke skipped: run npm run build first");
  process.exit(0);
}
const port = Number(process.env.STANDALONE_SMOKE_PORT ?? 3022);
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const tempDb = path.join(os.tmpdir(), `index-boundary-standalone-${process.pid}.db`);
const child = spawn(process.execPath, [path.join(root, "scripts", "start-standalone.mjs")], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), IB_DB_PATH: tempDb },
});
let logs = "";
child.stdout?.on("data", (chunk) => { logs += chunk.toString(); });
child.stderr?.on("data", (chunk) => { logs += chunk.toString(); });

async function waitFor(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`standalone server did not become ready:\n${logs}`);
}

try {
  const origin = `http://127.0.0.1:${port}${basePath}`;
  const rootResponse = await waitFor(`${origin}/`);
  const [sw, manifest] = await Promise.all([
    fetch(`${origin}/sw.js`),
    fetch(`${origin}/manifest.json`),
  ]);
  if (!sw.ok || !manifest.ok) throw new Error(`PWA assets failed: sw=${sw.status}, manifest=${manifest.status}`);
  if (!sw.headers.get("cache-control")?.includes("no-cache")) throw new Error("sw.js is missing no-cache headers");
  console.log(`standalone smoke passed: root=${rootResponse.status}, sw=${sw.status}, manifest=${manifest.status}`);
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${tempDb}${suffix}`, { force: true });
}
