// V2 验收：试炼赛季（Roguelite 挑战赛季）
import { GameEngine, createNewState } from "../src/game/engine";
import { CONFIG } from "../src/game/config";
import { toBig } from "../src/game/bignum";
import { normalizeState } from "../src/game/save";
import { seasonScore } from "../src/game/formulas";
import type { ChallengeId } from "../src/game/types";

let failed = false;
function check(name: string, cond: boolean, extra = ""): void {
  if (!cond) { console.error("  ✗ " + name + (extra ? " — " + extra : "")); failed = true; }
  else console.log("  ✓ " + name + (extra ? " — " + extra : ""));
}

function weakEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills"];
  st.combat.enemyHp = [1, 2];
  st.combat.enemyMaxHp = [1, 2];
  return new GameEngine(st);
}
function unlockBase(eng: GameEngine): void {
  for (const id of CONFIG.SEASON.UNLOCK_CHALLENGES) eng.state.challenges[id].claimed = true;
}

console.log("=== V2 验收：试炼赛季（Roguelite 挑战赛季）===");

// 1. 解锁
const eng = weakEngine(1);
check("未通关基础挑战时未解锁", !eng.isSeasonUnlocked());
unlockBase(eng);
check("通关全部基础挑战后解锁", eng.isSeasonUnlocked());

// 2. 修饰符校验
check("空/重复/超数量/非法组合均拒绝", !eng.startSeason([]) && !eng.startSeason(["no_crit", "no_crit"]) && !eng.startSeason(["no_crit", "slow_universe", "poverty", "durable"]) && !eng.startSeason(["bad" as ChallengeId]));

// 3. 开始赛季：重置本局 + 写入状态 + 互斥单挑战
eng.state.combat.stage = 300;
eng.state.player.gold = [5, 20];
eng.state.meta.activeChallenge = "no_crit";
const ok = eng.startSeason(["durable", "skill_slow"]);
check("startSeason 成功", ok);
check("赛季重置本局（关/金币/升级清零）", eng.state.combat.stage === 1 && toBig(eng.state.player.gold).toNumber() === 0 && eng.state.player.upgrades.attack === 0);
check("单挑战被清除、赛季修饰符写入", eng.state.meta.activeChallenge === null && eng.state.meta.activeModifiers.join(",") === "durable,skill_slow");
check("赛季状态写入（unlocked/lastModifiers）", eng.state.season.unlocked && eng.state.season.lastModifiers.join(",") === "durable,skill_slow");

// 4. 修饰符生效
const a = weakEngine(2); const b = weakEngine(2);
unlockBase(a); unlockBase(b);
a.startSeason(["poverty"]); const hpBase = toBig(a.state.combat.enemyMaxHp);
b.startSeason(["durable"]);
check("顽石外壳：敌人生命 ×2", b.derived.enemyHpMult === 2 && Math.abs(toBig(b.state.combat.enemyMaxHp).div(hpBase).toNumber() - 2) < 1e-6);
const sk = weakEngine(3); unlockBase(sk);
const cdBefore = sk.derived.skillCdMult;
sk.startSeason(["skill_slow"]);
check("技能迟滞：冷却 ×2", Math.abs(sk.derived.skillCdMult - cdBefore * 2) < 1e-6);
const mix = weakEngine(4); unlockBase(mix);
mix.startSeason(["no_crit", "slow_universe"]);
mix.state.player.upgrades.aspd = 10; mix.state.player.upgrades.critChance = 20; mix.recomputeDerived();
const base = weakEngine(5); unlockBase(base); base.state.player.upgrades.aspd = 10; base.recomputeDerived();
check("叠加：无暴击+慢速宇宙同时生效", mix.derived.critChance === 0 && Math.abs(mix.derived.panelAps - base.derived.panelAps * 0.5) < 1e-6);

// 5. 计分与进度
check("赛季分公式（关卡 × (1+0.5×修饰符数)）", seasonScore(300, ["no_crit", "slow_universe", "poverty"]) === 750);
const prog = weakEngine(6); unlockBase(prog);
prog.startSeason(["poverty", "slow_universe"]);
prog.state.combat.stage = 200;
prog.state.combat.enemyHp = [1, 2];
prog.state.combat.enemyMaxHp = [1, 2];
for (let i = 0; i < 5; i++) {
  const hp = toBig(prog.state.combat.enemyHp);
  prog.state.combat.enemyHp = hp.mul(toBig(0.1)).toTuple();
  prog.state.combat.enemyMaxHp = hp.toTuple();
  prog.click();
}
const stg = prog.state.combat.stage;
check("赛季最佳关/分随推关更新", prog.state.season.bestStage === stg && prog.state.season.bestScore === seasonScore(stg, ["poverty", "slow_universe"]));
check("赛季进度计入对应基础挑战", prog.state.challenges.poverty.best === stg && prog.state.challenges.slow_universe.best === stg);

// 6. 档位奖励
const tier = weakEngine(7); unlockBase(tier);
tier.state.season.bestScore = CONFIG.SEASON.TIERS.gold.threshold;
const cores = toBig(tier.state.skills.cores).toNumber();
const talent = tier.state.talents.points;
const shards = tier.state.laws.shards;
check("金档可领且一次性", tier.canClaimSeasonTier("gold") && tier.claimSeasonTier("gold") && !tier.claimSeasonTier("gold"));
check("金档奖励：核心+天赋点+法则碎片", toBig(tier.state.skills.cores).toNumber() === cores + CONFIG.SEASON.TIERS.gold.rewardCores && tier.state.talents.points === talent + CONFIG.SEASON.TIERS.gold.rewardTalent && tier.state.laws.shards === shards + CONFIG.SEASON.TIERS.gold.rewardShards);

// 7. 存档兼容
const s = normalizeState({ meta: { version: 2 } } as unknown);
check("旧档补齐 season / activeModifiers", s.season.bestScore === 0 && s.meta.activeModifiers.length === 0);

if (failed) { console.error("试炼赛季验收失败"); process.exit(1); }
console.log("V2 验收通过 ✓（试炼赛季/修饰符叠加/档位奖励/存档兼容）");