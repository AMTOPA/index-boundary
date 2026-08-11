// V2.5 验收：离线收益修复 —— Boss 关起步不再 0 / 撞墙回退农场 / Boss 击杀推进 / 8h 封顶
import { createNewState, GameEngine } from "../src/game/engine";

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) console.log("  ✓ " + msg);
  else {
    failures++;
    console.error("  ✗ " + msg);
  }
}

function make(seed: number, stage: number, atk: number): ReturnType<typeof createNewState> {
  const s = createNewState(seed);
  s.meta.unlocks = ["auto_attack", "boss", "crit", "aspd_upgrade", "equipment", "skills", "talents", "prestige"];
  s.player.upgrades.attack = atk;
  s.player.upgrades.aspd = 50;
  s.player.upgrades.critChance = 30;
  s.player.upgrades.critDamage = 20;
  s.combat.stage = stage;
  return s;
}

function run(stage: number, atk: number, durSec = 600) {
  const s = make(1, stage, atk);
  const r = GameEngine.simulateOffline(s, durSec);
  return { gold: r.goldGained.toNumber(), kills: r.kills, stages: r.stagesAdvanced, drops: r.drops, seconds: r.seconds, capped: r.capped };
}

console.log("=== 离线收益验收：Boss 关 / 墙前 / 撞墙 / 封顶 ===");

// 1) Boss 关起步且能击杀 Boss：收益 > 0 且推进 ≥ 1
const r1 = run(120, 100);
ok(r1.gold > 0, `Boss 120 可击杀 → 金币 > 0 (${r1.gold.toExponential(2)})`);
ok(r1.kills > 0, `Boss 120 可击杀 → 击杀 > 0 (${r1.kills})`);
ok(r1.stages >= 1, `Boss 120 可击杀 → 推进 ≥ 1 (${r1.stages})`);

// 2) 119 起步（Boss 前）：收益 > 0
const r2 = run(119, 100);
ok(r2.gold > 0, `119 起步 → 金币 > 0 (${r2.gold.toExponential(2)})`);

// 3) 111 起步：击杀 ≥ 9（能推到 Boss 前）
const r3 = run(111, 100);
ok(r3.kills >= 9, `111 起步 → 击杀 ≥ 9 (${r3.kills})`);

// 4) Boss 打不动（119 能打、120 打不动）：回退到 Boss 前普通关农场 → 金币 > 0、阶段不推进、无掉落
const r4 = run(120, 20);
ok(r4.gold > 0, `Boss 120 打不动 → 金币 > 0 (${r4.gold.toExponential(2)})`);
ok(r4.stages === 0, `Boss 120 打不动 → 阶段不推进 (${r4.stages})`);
ok(r4.drops === 0, `Boss 120 打不动 → 无掉落 (${r4.drops})`);

// 5) 普通怪撞墙（当前关打不动）：回退农场 → 金币 > 0、阶段不推进
const r5 = run(500, 1);
ok(r5.gold > 0, `普通怪撞墙 500 → 金币 > 0 (${r5.gold.toExponential(2)})`);
ok(r5.stages === 0, `普通怪撞墙 500 → 阶段不推进 (${r5.stages})`);

// 6) 8 小时封顶
const r6 = run(111, 100, 20 * 3600);
ok(r6.seconds === 8 * 3600, `离线 20h 封顶 8h (${(r6.seconds / 3600).toFixed(1)}h)`);
ok(r6.capped === true, `capped 标记 = true`);

// 7) handleOffline 全链路：Boss 关存档 10 分钟前 → 收益 > 0 且不停在 Boss 关
const s7 = make(7, 120, 20);
s7.meta.lastSeenAt = Date.now() - 600 * 1000;
const eng7 = new GameEngine(s7);
const off7 = eng7.handleOffline(Date.now());
ok(off7 !== null, `handleOffline 返回结果`);
if (off7) {
  ok(off7.goldGained.toNumber() > 0, `handleOffline → 金币 > 0 (${off7.goldGained.toNumber().toExponential(2)})`);
  const finalStage = s7.combat.stage + off7.stagesAdvanced;
  ok(finalStage % 10 !== 0 || finalStage === 1, `handleOffline 结算后不停在 Boss 关 (final=${finalStage})`);
}

console.log(failures === 0 ? "离线收益验收通过 ✓" : `离线收益验收失败 ✗ (${failures})`);
process.exit(failures === 0 ? 0 : 1);