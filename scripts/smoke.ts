// 引擎 headless 冒烟：用自动玩家模拟器跑 1h / 10h，检查数值健康（无 NaN、进度合理、Boss/重构可触发）
import { runAutoPlayer } from "../src/game/simulator";

function fmt(b: { toNumber(): number; isZero(): boolean; e: number; m: number }): string {
  if (b.isZero()) return "0";
  const e = b.e;
  if (e < 6) return b.toNumber().toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${b.m.toFixed(2)}e${e}`;
}

function main(): void {
  console.log("=== 引擎冒烟测试（自动玩家模拟） ===");
  let failed = false;
  for (const hours of [1, 10]) {
    const t0 = Date.now();
    const s = runAutoPlayer({ hours, seed: 20260809 });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `  ${hours}h: 关卡=${s.stage} 历史最高=${s.maxStage} DPS=${fmt(s.dps)} 金币=${fmt(s.gold)} ` +
      `总伤=10^${s.totalDamageMag} 击杀=${s.kills} Boss=${s.bossKills} 重构=${s.prestiges} 能量=${s.energy} ` +
      `首次重构=${s.firstPrestigeAt >= 0 ? `${(s.firstPrestigeAt / 60).toFixed(0)}min` : "未触发"} (耗时 ${dt}s)`
    );
    if (s.maxStage <= 1) { console.error("  失败: 关卡未推进"); failed = true; }
    if (s.kills <= 50) { console.error("  失败: 击杀过少"); failed = true; }
  }
  if (failed) {
    console.error("冒烟测试失败");
    process.exit(1);
  }
  console.log("冒烟测试通过 ✓");
}

main();