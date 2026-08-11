// V1 验收：重构后重推旧进度耗时 ≤ 原首次重构耗时的 30%
// 证据：固定种子跑 4 种策略 1h，断言 reclearTime / firstPrestigeAt ≤ 0.3
import { runAutoPlayer } from "../src/game/simulator";
import type { SimStrategy } from "../src/game/simulator";

const SEED = 777001;
const LABEL: Record<SimStrategy, string> = { equal: "均衡", attack: "攻击", gold: "金币", crit: "暴击", aspd: "攻速" };

function main(): void {
  console.log("=== 重构重推验收（重推耗时 ≤ 原耗时 30%） ===");
  let ok = true;
  const strategies: SimStrategy[] = ["equal", "attack", "crit", "aspd"];
  for (const s of strategies) {
    const r = runAutoPlayer({ hours: 1, seed: SEED, strategy: s });
    if (r.firstPrestigeAt < 0) {
      console.log(`  ${LABEL[s]} 1h：未重构（进度不足，跳过）`);
      continue;
    }
    const ratio = r.reclearTime >= 0 ? r.reclearTime / r.firstPrestigeAt : -1;
    const pass = ratio >= 0 && ratio <= 0.3;
    const reclearStr = r.reclearTime >= 0 ? `${(r.reclearTime / 60).toFixed(2)}m` : "未回到";
    console.log(
      `  ${LABEL[s]} 1h：首次重构=${(r.firstPrestigeAt / 60).toFixed(1)}m(第${r.firstPrestigeStage}关) ` +
      `重推=${reclearStr} 比率=${ratio >= 0 ? (ratio * 100).toFixed(1) : "-"}% ${pass ? "✓" : "✗ 失败"}`
    );
    if (!pass) ok = false;
  }
  if (!ok) {
    console.error("重构重推验收失败：存在重推耗时 > 原 30% 的流派");
    process.exit(1);
  }
  console.log("重构重推验收通过 ✓（重推耗时 ≤ 原 30%）");
}

main();