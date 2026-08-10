// 深推探查：跑长时模拟，打印 maxStage / 全局倍率 / DPS 数量级（探查用，不进 CI）
import { runAutoPlayer } from "../src/game/simulator";

for (const h of [10, 30, 60]) {
  const t0 = Date.now();
  const r = runAutoPlayer({ hours: h, seed: 424242, strategy: "equal" });
  const el = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${h}h: stage=${r.stage} maxStage=${r.maxStage} dpsMag=${r.dps.log10().toFixed(2)} totalMag=${r.totalDamageMag} energy=${r.energy} prestiges=${r.prestiges} (${el}s)`);
}