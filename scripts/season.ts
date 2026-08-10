// 试炼赛季平衡探查（手动脚本，不进 CI）：合成「已通关基础挑战」的中期账号，
// 用 3 修饰符 / 1 修饰符分别跑一次赛季推关，验证铜/银/金档阈值可达性。
import { GameEngine, createNewState } from "../src/game/engine";
import { CONFIG } from "../src/game/config";
import { toBig } from "../src/game/bignum";
import type { ChallengeId, SkillId } from "../src/game/types";

const TALENT_PRIORITY: string[] = [
  "dest_sharp", "dest_crit", "auto_beat", "dest_super", "dest_hunter",
  "auto_offline", "auto_skip", "greed_loot", "greed_pan", "greed_refine",
  "dest_keystone_absolute", "greed_keystone_compound",
];

function progressedAccount(seed: number): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills", "prestige", "equipment", "boss"];
  // 永久进度：重构能量 + 商店
  st.prestige.energy = 40;
  st.prestige.purchases = { startPower: 3, goldKeep: 2, fastSkip: 3, startSkill: 1, singularityAmp: 2 };
  // 技能：解锁并拉到中等级
  const skillIds: SkillId[] = ["overclock", "critical_strike", "gold_collapse", "singularity_cannon", "emp_burst"];
  st.skills.actives = skillIds.map((id) => ({ id, level: 20, cdRemaining: 0, activeUntil: 0, active: false }));
  st.skills.passives = { rhythm: 8, focus: 8, greed: 8 };
  st.skills.cores = [0, 3]; // 1000 核心（升级用）
  // 天赋点
  st.talents.points = 40;
  const eng = new GameEngine(st);
  for (const id of TALENT_PRIORITY) eng.allocate(id);
  // 装备：每槽一件传奇并装备（不强化，避免碎片依赖）
  const slots: ["weapon", "core", "engine", "charm", "module", "beacon", "relic"] = ["weapon", "core", "engine", "charm", "module", "beacon", "relic"];
  for (const slot of slots) {
    eng.state.equipment.fragments = [0, 6]; // 1e6 碎片，保证可做传奇
    const ok = eng.craft(slot, "legendary");
    if (ok) {
      const inv = eng.state.equipment.inventory;
      const item = inv[inv.length - 1];
      if (item) eng.equipItem(item.uid);
    }
  }
  eng.recomputeDerived();
  return eng;
}

function runSeason(hours: number, mods: ChallengeId[], seed: number): { stage: number; score: number; scoreMult: number } {
  const eng = progressedAccount(seed);
  for (const id of CONFIG.SEASON.UNLOCK_CHALLENGES) eng.state.challenges[id].claimed = true;
  if (!eng.startSeason(mods)) throw new Error("startSeason failed: " + mods.join(","));
  const dt = 1 / CONFIG.TICK_RATE;
  const ticks = Math.floor((hours * 3600) / dt);
  let buy = 0;
  for (let i = 0; i < ticks; i++) {
    eng.tick(dt);
    if (eng.state.combat.isBoss) eng.click();
    else if (i % 20 === 0) eng.click();
    buy++;
    if (buy >= 10) {
      buy = 0;
      eng.smartBuy();
      // 技能好了就放（爆发技能留到 Boss 卡墙）
      const wall = eng.state.combat.isBoss;
      const castable = eng.state.skills.actives.filter((s) => s.cdRemaining <= 0);
      for (const s of castable) {
        if (s.id === "critical_strike" || s.id === "overclock" || (wall && (s.id === "singularity_cannon" || s.id === "emp_burst"))) {
          eng.cast(s.id);
        }
      }
    }
  }
  return {
    stage: eng.state.combat.stage,
    score: eng.state.season.bestScore,
    scoreMult: 1 + mods.length * CONFIG.SEASON.WEIGHT_PER_MODIFIER,
  };
}

console.log("=== 试炼赛季平衡探查（合成中期账号，模拟 2h）===");
const mods3: ChallengeId[] = ["no_crit", "slow_universe", "poverty"];
const r3 = runSeason(2, mods3, 2024);
console.log(`3 修饰符（无暴击+慢速+贫困）：2h 后 stage=${r3.stage}  bestScore=${r3.score}（倍率×${r3.scoreMult}）`);
console.log(`  铜${CONFIG.SEASON.TIERS.bronze.threshold} / 银${CONFIG.SEASON.TIERS.silver.threshold} / 金${CONFIG.SEASON.TIERS.gold.threshold}：${
  r3.score >= CONFIG.SEASON.TIERS.gold.threshold ? "金可达" : r3.score >= CONFIG.SEASON.TIERS.silver.threshold ? "银可达，金需更久" : r3.score >= CONFIG.SEASON.TIERS.bronze.threshold ? "铜可达" : "铜未达（阈值需下调）"}`);

const r1 = runSeason(2, ["durable"], 2025);
console.log(`1 修饰符（顽石外壳）：2h 后 stage=${r1.stage}  bestScore=${r1.score}（倍率×${r1.scoreMult}）`);
console.log(`  铜${CONFIG.SEASON.TIERS.bronze.threshold} / 银${CONFIG.SEASON.TIERS.silver.threshold} / 金${CONFIG.SEASON.TIERS.gold.threshold}：${
  r1.score >= CONFIG.SEASON.TIERS.gold.threshold ? "金可达" : r1.score >= CONFIG.SEASON.TIERS.silver.threshold ? "银可达，金需更久" : r1.score >= CONFIG.SEASON.TIERS.bronze.threshold ? "铜可达" : "铜未达（阈值需下调）"}`);
console.log("（提示：阈值可在 CONFIG.SEASON.TIERS 调整，属数值调参，不涉及逻辑）");