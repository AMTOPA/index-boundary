// 平衡对比：五种自动玩家策略在 1h / 10h 的进度差异（固定种子，可复现）
import { runAutoPlayer, type SimStrategy } from "../src/game/simulator";
import { Big } from "../src/game/bignum";

const SEED = 424242;
const LABEL: Record<SimStrategy, string> = { equal: "均衡", attack: "攻击优先", gold: "金币优先", crit: "暴击流", aspd: "攻速流" };

function fmt(b: Big): string {
  if (b.isZero()) return "0";
  const e = b.e;
  if (e < 6) return b.toNumber().toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${b.m.toFixed(2)}e${e}`;
}

function pad(s: string, n: number): string { return s.padEnd(n); }

function main(): void {
  console.log("=== 五策略平衡对比（自动玩家模拟，固定种子） ===");
  const header = `${pad("策略", 10)}${pad("时长", 6)}${pad("当前关", 8)}${pad("历史最高", 10)}${pad("DPS", 14)}${pad("金币", 14)}${pad("总伤", 10)}${pad("击杀", 8)}${pad("Boss", 6)}${pad("重构", 6)}${pad("能量", 8)}${pad("首重构", 8)}`;
  console.log(header);
  console.log("-".repeat(header.length));
  let failed = false;
  const strategies: SimStrategy[] = ["equal", "attack", "gold", "crit", "aspd"];
  for (const h of [1, 10]) {
    for (const s of strategies) {
      const t0 = Date.now();
      const r = runAutoPlayer({ hours: h, seed: SEED, strategy: s });
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `${pad(LABEL[s], 10)}${pad(`${h}h`, 6)}${pad(String(r.stage), 8)}${pad(String(r.maxStage), 10)}` +
        `${pad(fmt(r.dps), 14)}${pad(fmt(r.gold), 14)}${pad(`10^${r.totalDamageMag}`, 10)}${pad(String(r.kills), 8)}` +
        `${pad(String(r.bossKills), 6)}${pad(String(r.prestiges), 6)}${pad(String(r.energy), 8)}` +
        `${pad(r.firstPrestigeAt >= 0 ? `${(r.firstPrestigeAt / 60).toFixed(0)}m` : "-", 8)} (${el}s)`
      );
      if (r.maxStage <= 1) { console.error(`  策略 ${s} ${h}h 未推进`); failed = true; }
    }
  }
  if (failed) { console.error("平衡对比失败"); process.exit(1); }
  console.log("平衡对比通过 ✓（更多分析请使用 /dev/balance 页面）");
}

main();