import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * 图标生成脚本：从 SVG 源生成 favicon / PWA / apple-touch / og-image 全套装。
 * 用法：node scripts/gen-icons.mjs   （依赖 sharp，随 next 一并安装）
 */

const OUT = "public";

/** 把多张 PNG 打包成 ICO（PNG-in-ICO，现代浏览器/系统通用） */
function buildIco(entries) {
  const headerSize = 6;
  const entrySize = 16;
  const count = entries.length;
  let offset = headerSize + entrySize * count;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);
  const dir = [];
  for (const e of entries) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(e.size >= 256 ? 0 : e.size, 0); // width
    entry.writeUInt8(e.size >= 256 ? 0 : e.size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(e.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += e.png.length;
    dir.push(entry);
  }
  return Buffer.concat([header, Buffer.concat(dir), ...entries.map((e) => e.png)]);
}

async function renderSvg(input, size) {
  return sharp(input, { density: 300 }).resize(size, size).png().toBuffer();
}

async function main() {
  const mark = path.join(OUT, "favicon-mark.svg"); // 紧凑 ∞ 图标（小尺寸用）
  const full = path.join(OUT, "icon.svg"); // 完整图标（含中文名）

  // 1) favicon PNG 系列（来自紧凑 mark）
  const favPngs = {};
  for (const s of [16, 32, 48, 96]) {
    const buf = await renderSvg(mark, s);
    favPngs[s] = buf;
    fs.writeFileSync(path.join(OUT, `favicon-${s}x${s}.png`), buf);
  }

  // 2) apple-touch-icon 180（iOS 主屏图标，来自完整图标）
  fs.writeFileSync(path.join(OUT, "apple-touch-icon.png"), await renderSvg(full, 180));

  // 3) android-chrome / PWA 图标 192 + 512
  fs.writeFileSync(path.join(OUT, "android-chrome-192x192.png"), await renderSvg(full, 192));
  fs.writeFileSync(path.join(OUT, "android-chrome-512x512.png"), await renderSvg(full, 512));

  // 4) favicon.ico（16/32/48 多尺寸）
  const icoBuf = buildIco([16, 32, 48].map((s) => ({ png: favPngs[s], size: s })));
  fs.writeFileSync(path.join(OUT, "favicon.ico"), icoBuf);

  // 5) favicon.svg = 紧凑 mark
  fs.copyFileSync(mark, path.join(OUT, "favicon.svg"));

  // 6) og-image 1200x630（社交分享/收录用）
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="ogbg" cx="30%" cy="40%" r="90%">
      <stop offset="0%" stop-color="#101b33"/>
      <stop offset="55%" stop-color="#0a1020"/>
      <stop offset="100%" stop-color="#060a14"/>
    </radialGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#35c6f0"/>
      <stop offset="100%" stop-color="#ffd93d"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <rect x="0" y="0" width="1200" height="6" fill="url(#line)"/>
  <text x="310" y="360" text-anchor="middle" font-family="Georgia, serif" font-size="300" font-weight="bold" fill="#35c6f0">\u221E</text>
  <text x="640" y="300" font-family="sans-serif" font-size="88" font-weight="bold" fill="#eef4ff">指数边界</text>
  <text x="642" y="360" font-family="sans-serif" font-size="40" letter-spacing="4" fill="#9fb3d1">Boundless Exponent</text>
  <text x="642" y="420" font-family="sans-serif" font-size="30" fill="#6f86a8">数值膨胀 · 放置 · 构筑 Web 游戏</text>
</svg>`;
  fs.writeFileSync(path.join(OUT, "og-image.png"), await renderSvg(Buffer.from(ogSvg), 1200));

  console.log("图标已生成到 public/：favicon-{16,32,48,96} / favicon.ico / favicon.svg / apple-touch-icon / android-chrome-{192,512} / og-image");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});