// V2 验收：Boss 自动攻击统一后攻速流略受益，暴击流 vs 攻速流进度差允许 ≤ 22%（固定种子，可复现）
import { runAutoPlayer } from "../src/game/simulator";
import { Big } from "../src/game/bignum";

const SEED = 777001;
const MAX_STAGE_GAP = 0.22;

function fmt(b: Big): string {
  if (b.isZero()) return "0";
  const e = b.e;
  if (e < 6) return b.toNumber().toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${b.m.toFixed(2)}e${e}`;
}

function main(): void {
  console.log("=== 暴击流 vs 攻速流进度对比（V2 验收：差 ≤ 22%） ===");
  let ok = true;
  for (const h of [1, 10]) {
    const crit = runAutoPlayer({ hours: h, seed: SEED, strategy: "crit" });
    const aspd = runAutoPlayer({ hours: h, seed: SEED, strategy: "aspd" });
    const gap = Math.abs(crit.maxStage - aspd.maxStage) / Math.max(1, Math.max(crit.maxStage, aspd.maxStage));
    const magGap = Math.abs(crit.totalDamageMag - aspd.totalDamageMag);
    console.log(
      `  ${h}h: 暴击流 关卡=${crit.stage} 最高=${crit.maxStage} 总伤=10^${crit.totalDamageMag} DPS=${fmt(crit.dps)} 重构=${crit.prestiges} | ` +
      `攻速流 关卡=${aspd.stage} 最高=${aspd.maxStage} 总伤=10^${aspd.totalDamageMag} DPS=${fmt(aspd.dps)} 重构=${aspd.prestiges} | ` +
      `关卡差=${(gap * 100).toFixed(1)}% 数量级差=${magGap}`
    );
    if (crit.maxStage <= 1 || aspd.maxStage <= 1) { console.error("  失败: 某流派未推进"); ok = false; }
    if (gap > MAX_STAGE_GAP) { console.error(`  失败: 关卡差 ${(gap * 100).toFixed(1)}% > ${MAX_STAGE_GAP * 100}%`); ok = false; }
  }
  if (ok) console.log("构筑平衡验收通过 ✓（暴击流/攻速流差 ≤ 22%）");
  else { console.error("构筑平衡验收失败"); process.exit(1); }
}

main();