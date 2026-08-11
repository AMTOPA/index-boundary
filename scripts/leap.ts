// V1.5 验收：世界跃迁（第二层）+ 世界核心 + 奇点天赋树
import { GameEngine, createNewState } from "../src/game/engine";
import { CONFIG } from "../src/game/config";
import { leapShopCostFrom, leapCores, leapAllStatsMult, effectiveHpGrowth } from "../src/game/systems/leap";
import { enemyHp, bossHp } from "../src/game/formulas";
import { worldForStage } from "../src/game/data/worlds";
import { Big } from "../src/game/bignum";
import type { GameState } from "../src/game/types";

let failed = false;
function check(name: string, cond: boolean, extra = ""): void {
  if (!cond) { console.error(`  ✗ ${name} ${extra}`); failed = true; }
  else console.log(`  ✓ ${name}${extra ? " — " + extra : ""}`);
}

function leapReady(seed = 1): GameState {
  const st = createNewState(seed);
  st.meta.unlocks.push("leap");
  st.combat.stage = CONFIG.LEAP.STAGE;
  st.statistics.allTimeMaxStage = CONFIG.LEAP.STAGE;
  st.statistics.totalDamage = [1, 120];
  return st;
}

console.log("=== V1.5 验收：世界跃迁 + 世界核心 + 奇点天赋 ===");

// 1. 解锁与跃迁
const eng = new GameEngine(leapReady(101));
check("10000 关可跃迁", eng.canLeap());
const r = eng.leap();
check("10000 关首次跃迁获得基础 1 核心", r !== null && r.cores === 1, `cores=${r?.cores}`);
check("跃迁后关卡回到 1（起始世界 Lv0）", eng.state.combat.stage === 1);
check("跃迁重置升级", eng.state.player.upgrades.attack === 0);
check("跃迁重置装备", Object.keys(eng.state.equipment.slots).length === 0);
check("跃迁重置天赋", Object.keys(eng.state.talents.allocations).length === 0);
check("跃迁重置重构及其门槛", eng.state.prestige.energy === 0 && eng.state.prestige.nextRequiredStage === CONFIG.PRESTIGE.BASE_STAGE);
check("跃迁保留统计（总伤不清零）", eng.state.statistics.totalDamage[1] === 120);

const stStart = leapReady(106);
stStart.leap.purchases.startStage = 3;
const engStart = new GameEngine(stStart);
engStart.leap();
check("起始世界 Lv3 → 301 关且五项基础升级均为 300 级", engStart.state.combat.stage === 301 && Object.values(engStart.state.player.upgrades).every((lv) => lv === 300));

// 2. 世界核心商店价格
const fib = [1, 2, 3, 5, 8, 13];
let fibOk = true;
fib.forEach((v, i) => { if (leapShopCostFrom(i, "allStats") !== v) fibOk = false; });
check("商店价格 1/2/3/5/8/13（斐波那契）", fibOk);

// 3. 阶梯核心奖励 + 全属性每级 ×1.3
const atBonusThreshold = leapReady(107);
atBonusThreshold.combat.stage = CONFIG.LEAP.CORE_BONUS_STAGE;
check("15000 关获得 2 核心", leapCores(atBonusThreshold) === 2);
const higherBonusThreshold = leapReady(108);
higherBonusThreshold.combat.stage = 18000;
check("18000 关获得 5 核心", leapCores(higherBonusThreshold) === 5);
check("全属性 Lv1 → ×1.3", Math.abs(leapAllStatsMult(1).toNumber() - 1.3) < 1e-9);
check("全属性 Lv3 → ×2.197", Math.abs(leapAllStatsMult(3).toNumber() - Math.pow(1.3, 3)) < 1e-9);

// 4. 法则指数有界降低 HP
const stLaw = leapReady(102);
stLaw.leap.purchases.lawExponent = 30; // 超上限
check("法则指数上限 -0.12", Math.abs(effectiveHpGrowth(stLaw) - (CONFIG.HP_GROWTH - 0.12)) < 1e-9);
const engLaw = new GameEngine(stLaw);
const hpReduced = enemyHp(1000, engLaw.derived.hpGrowth).lt(enemyHp(1000));
check("怪物 HP 随法则指数下降", hpReduced);

// 5. 新世界解锁
check("未升级新世界 → 黑洞边界封顶", worldForStage(60000, 0).id === "black_hole");
check("新世界 Lv1 → 奇点熔炉", worldForStage(20000, 1).id === "singularity_furnace");
check("新世界 Lv2 → 法则终境", worldForStage(60000, 2).id === "law_terminus");

// 6. 奇点天赋：深渊豪赌（Boss 猎杀流）
const stSing = leapReady(103);
stSing.meta.unlocks.push("talents");
stSing.talents.points = 40;
const engSing = new GameEngine(stSing);
engSing.allocate("sing_law"); engSing.allocate("sing_law"); engSing.allocate("sing_law");
engSing.allocate("sing_cap"); engSing.allocate("sing_cap"); engSing.allocate("sing_cap");
engSing.allocate("sing_skill_cd"); engSing.allocate("sing_skill_cd"); engSing.allocate("sing_skill_cd");
engSing.allocate("sing_overflow"); engSing.allocate("sing_overflow"); engSing.allocate("sing_overflow");
check("奇点 Keystone 深渊豪赌可点", engSing.allocate("sing_keystone_boss"));
check("Boss 生命 ×2", engSing.derived.bossHpMult.toNumber() === 2);
check("Boss 金币 ×6", engSing.derived.bossGoldMult.toNumber() === 6);

// 7. 奇点天赋：法则扭曲降低 HP 成长
const stSing2 = leapReady(104);
stSing2.meta.unlocks.push("talents");
stSing2.talents.points = 10;
const engSing2 = new GameEngine(stSing2);
engSing2.allocate("sing_law"); engSing2.allocate("sing_law"); engSing2.allocate("sing_law");
check("法则扭曲 HP 成长降低", engSing2.derived.hpGrowth < CONFIG.HP_GROWTH);

// 8. 自动跃迁
const stAuto = leapReady(105);
const engAuto = new GameEngine(stAuto);
engAuto.leap(); // 1 core
engAuto.buyLeapUpgrade("autoLeap"); // cost 1
engAuto.state.combat.stage = engAuto.leapRequiredStage();
engAuto.state.statistics.allTimeMaxStage = engAuto.leapRequiredStage();
engAuto.state.combat.enemyHp = [1, 60];
const leapsBefore = engAuto.state.leap.totalLeaps;
engAuto.tick(1 / CONFIG.TICK_RATE);
engAuto.tick(1 / CONFIG.TICK_RATE);
check("自动跃迁卡墙触发", engAuto.state.leap.totalLeaps > leapsBefore);

console.log(failed ? "V1.5 验收失败" : "V1.5 验收通过 ✓（世界跃迁/世界核心/奇点天赋）");
process.exit(failed ? 1 : 0);
