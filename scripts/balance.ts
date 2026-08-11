// 平衡对比：五种自动玩家策略在 1h / 10h 的进度差异（固定种子，可复现）
import { runAutoPlayer, type SimResult, type SimStrategy } from "../src/game/simulator";
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
  const results = new Map<number, Map<SimStrategy, SimResult>>();
  const strategies: SimStrategy[] = ["equal", "attack", "gold", "crit", "aspd"];
  for (const h of [1, 10]) {
    const byStrategy = new Map<SimStrategy, SimResult>();
    results.set(h, byStrategy);
    for (const s of strategies) {
      const t0 = Date.now();
      const r = runAutoPlayer({ hours: h, seed: SEED, strategy: s });
      byStrategy.set(s, r);
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `${pad(LABEL[s], 10)}${pad(`${h}h`, 6)}${pad(String(r.stage), 8)}${pad(String(r.maxStage), 10)}` +
        `${pad(fmt(r.dps), 14)}${pad(fmt(r.gold), 14)}${pad(`10^${r.totalDamageMag}`, 10)}${pad(String(r.kills), 8)}` +
        `${pad(String(r.bossKills), 6)}${pad(String(r.prestiges), 6)}${pad(String(r.energy), 8)}` +
        `${pad(r.firstPrestigeAt >= 0 ? `${(r.firstPrestigeAt / 60).toFixed(0)}m` : "-", 8)} (${el}s)`
      );
      if (r.maxStage <= 1) { console.error(`  策略 ${s} ${h}h 未推进`); failed = true; }
      if (r.prestiges <= 0 || r.firstPrestigeAt <= 0 || r.firstPrestigeAt > 15 * 60) {
        console.error(`  strategy ${s}/${h}h failed the first-prestige timing check`);
        failed = true;
      }
      const levels = r.upgradeLevels;
      if (levels.attack < 1 || levels.aspd < 1 || levels.critDamage < 1 || levels.gold < 1) {
        console.error(`  strategy ${s}/${h}h lacks required supporting upgrades`);
        failed = true;
      }
    }
  }
  const oneHour = results.get(1)!;
  const tenHours = results.get(10)!;
  for (const strategy of strategies) {
    const shortRun = oneHour.get(strategy)!;
    const longRun = tenHours.get(strategy)!;
    if (shortRun.maxStage < 2_500 || longRun.maxStage < 3_500 || longRun.maxStage < shortRun.maxStage) {
      console.error(`  strategy ${strategy} failed the 1h/10h progression floor`);
      failed = true;
    }
  }
  for (const [hours, byStrategy] of results) {
    const stages = [...byStrategy.values()].map((result) => result.maxStage);
    const spread = Math.max(...stages) / Math.min(...stages);
    if (spread > 2) {
      console.error(`  ${hours}h build spread is too large: ${spread.toFixed(2)}x`);
      failed = true;
    }
  }

  if (failed) { console.error("平衡对比失败"); process.exit(1); }
  console.log("平衡对比通过 ✓（更多分析请使用 /dev/balance 页面）");
}

main();
