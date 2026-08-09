import { Big } from "./bignum";

// 数量级后缀：K(1e3) M(1e6) B(1e9) T(1e12) aa(1e15) ab(1e18) ...
const SUFFIXES = (() => {
  const out: string[] = ["", "K", "M", "B", "T"];
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      out.push(String.fromCharCode(97 + i) + String.fromCharCode(97 + j));
    }
  }
  return out; // 覆盖到 1e(3 + 3*678) ≈ 1e2037
})();

// 主显示：<1e6 用千分位；1e6 ~ 1e2037 用后缀；更大用科学计数法
export function formatBig(b: Big): string {
  if (b.isZero()) return "0";
  const e = b.e;
  if (e < 0) {
    return b.toNumber().toFixed(2);
  }
  if (e < 6) {
    return Math.floor(b.toNumber() * 100) / 100 >= 1e6
      ? formatBig(new Big(b.m, e))
      : trimNumber(b.toNumber());
  }
  const idx = Math.floor(e / 3);
  if (idx < SUFFIXES.length) {
    const mantissa = b.m * Math.pow(10, e - idx * 3);
    return `${mantissa.toFixed(mantissa >= 100 ? 1 : 2)}${SUFFIXES[idx]}`;
  }
  return `${b.m.toFixed(2)}e${e}`;
}

function trimNumber(n: number): string {
  if (Number.isInteger(n) && n < 1e15) return n.toLocaleString("en-US");
  const s = n.toFixed(2).replace(/\.?0+$/, "");
  return s;
}

// 精确显示（统计面板用）：保留更多有效数字
export function formatBigPrecise(b: Big): string {
  if (b.isZero()) return "0";
  if (b.e < 15) return trimNumber(b.toNumber());
  return `${b.m.toPrecision(6)}e${b.e}`;
}

// 普通数字（非 Big）显示
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1e15) return n.toExponential(2);
  return trimNumber(n);
}

// 数量级标签：10^e
export function magnitudeLabel(e: number): string {
  return `10^${formatNumber(e)}`;
}

// 百分比显示（0.05 → 5%）
export function formatPct(x: number): string {
  return `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`;
}

// 倍率显示（×1.5 / ×2.6K）
export function formatMult(b: Big): string {
  if (b.lt(Big.ONE)) return `×${formatBig(b)}`;
  return `×${formatBig(b)}`;
}

// 时间显示（秒 → 人类可读）
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}m${s > 0 ? `${s}s` : ""}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${mm > 0 ? `${mm}m` : ""}`;
}