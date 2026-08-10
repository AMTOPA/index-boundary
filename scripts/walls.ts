// V1 验收：关卡击杀时间曲线出现墙，且每面墙至少 3 种流派（解法）可越过
// 证据：① 采样击杀时间曲线，找出“墙位”（击杀时间 > 墙阈值 的连续区间）
//       ② 统计各流派在 10h 内是否越过每面墙（到达该墙位以上关卡），断言 ≥3 种流派
import { runAutoPlayer } from "../src/game/simulator";
import type { SimStrategy } from "../src/game/simulator";

const SEED = 777001;
const WALL_SEC = 5; // 击杀时间超过 5s 视为撞墙
const WALL_CHECKPOINTS = [100, 150, 300, 500, 800, 1000]; // 待验证的墙位检查点
const LABEL: Record<SimStrategy, string> = { equal: "均衡", attack: "攻击", gold: "金币", crit: "暴击", aspd: "攻速" };

interface RunInfo {
  strategy: SimStrategy;
  maxStage: number;
  samples: { t: number; stage: number; killTime: number }[];
}

function main(): void {
  console.log("=== 成长墙验证（V1 验收：击杀时间曲线有墙 + 每墙 ≥3 种解法） ===");
  const strategies: SimStrategy[] = ["equal", "attack", "gold", "crit", "aspd"];
  const runs: RunInfo[] = [];
  for (const s of strategies) {
    const r = runAutoPlayer({ hours: 10, seed: SEED, strategy: s });
    runs.push({ strategy: s, maxStage: r.maxStage, samples: r.killTimeSamples });
    console.log(`  ${LABEL[s]} 10h: maxStage=${r.maxStage} 重构=${r.prestiges} 采样=${r.killTimeSamples.length}`);
  }

  // ---- ① 击杀时间曲线墙位 ----
  // 从均衡流采样曲线中提取“墙区间”：击杀时间连续 > 阈值的区间，取区间内最大击杀时间对应的关卡作为墙位
  const eq = runs.find((r) => r.strategy === "equal")!;
  const walls: { stage: number; peak: number }[] = [];
  let inWall = false;
  let segPeak = -1;
  let segStage = -1;
  for (const smp of eq.samples) {
    if (smp.killTime > WALL_SEC) {
      inWall = true;
      if (smp.killTime > segPeak) { segPeak = smp.killTime; segStage = smp.stage; }
    } else if (inWall) {
      walls.push({ stage: segStage, peak: segPeak });
      inWall = false;
      segPeak = -1;
      segStage = -1;
    }
  }
  if (inWall) walls.push({ stage: segStage, peak: segPeak });
  // 合并 15 关以内的相邻墙位（同一堵墙的多次采样）
  const merged: { stage: number; peak: number }[] = [];
  for (const w of walls.sort((a, b) => a.stage - b.stage)) {
    const last = merged[merged.length - 1];
    if (last && w.stage - last.stage <= 15) {
      if (w.peak > last.peak) last.peak = w.peak;
    } else {
      merged.push({ ...w });
    }
  }
  console.log(`  均衡流击杀时间曲线检出墙位（击杀>${WALL_SEC}s）：${merged.length > 0 ? merged.map((w) => `${w.stage}关(峰值${w.peak.toFixed(1)}s)`).join(" → ") : "无"}`);
  if (merged.length < 3) {
    console.error("  失败: 击杀时间曲线未检出至少 3 处明显墙位");
    process.exit(1);
  }

  // ---- ② 每墙 ≥3 种解法 ----
  let ok = true;
  for (const cp of WALL_CHECKPOINTS) {
    const crossed = strategies.filter((s) => {
      const run = runs.find((r) => r.strategy === s)!;
      return run.maxStage >= cp;
    });
    const names = crossed.map((s) => LABEL[s]).join("/");
    console.log(`  墙位 ${cp} 关：${crossed.length} 种流派可越过（${names}）${crossed.length >= 3 ? "✓" : "✗ 失败"}`);
    if (crossed.length < 3) ok = false;
  }
  if (!ok) {
    console.error("验收失败: 存在 <3 种解法可越过的墙");
    process.exit(1);
  }
  console.log("成长墙验证通过 ✓（击杀时间曲线有墙，且每墙 ≥3 种流派/解法）");
}

main();