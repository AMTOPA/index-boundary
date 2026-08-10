// V2 验收：法则重写（第三层）+ 法则碎片 + 公式补丁
import { GameEngine, createNewState } from "../src/game/engine";
import { CONFIG } from "../src/game/config";
import { lawShards, lawShopCostFrom, lawCritExp, lawGoldExp, lawApsCapAdd, lawGoldToDmgMult } from "../src/game/systems/law";
import { enemyGold, computeDerived, emptyBuffs, effectiveAps } from "../src/game/formulas";
import { normalizeState } from "../src/game/save";
import { Big, toBig } from "../src/game/bignum";
import type { GameState } from "../src/game/types";

let failed = false;
function check(name: string, cond: boolean, extra = ""): void {
  if (!cond) { console.error("  ✗ " + name + (extra ? " — " + extra : "")); failed = true; }
  else console.log("  ✓ " + name + (extra ? " — " + extra : ""));
}

function lawReady(seed = 1): GameState {
  const st = createNewState(seed);
  st.meta.unlocks.push("lawRewrite");
  st.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
  st.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;
  st.statistics.totalDamage = [1, 160];
  return st;
}

console.log("=== V2 验收：法则重写 + 法则碎片 + 公式补丁 ===");

// 1. 解锁与重写
const eng = new GameEngine(lawReady(101));
check("30000 关可重写", eng.canRewriteLaw());
const r = eng.rewriteLaw();
check("首次重写获得 2 碎片（1+翻倍）", r !== null && r.shards === 2, "shards=" + r?.shards);
check("重写后关卡回到 1", eng.state.combat.stage === 1);
check("重写重置升级", eng.state.player.upgrades.attack === 0);
check("重写重置装备", Object.keys(eng.state.equipment.slots).length === 0);
check("重写重置天赋", eng.state.talents.points === 0);
check("重写重置重构", eng.state.prestige.energy === 0);
check("重写保留统计（总伤不清零）", !toBig(eng.state.statistics.totalDamage).isZero());
check("重写保留成就/碎片", eng.state.laws.shards === 2 && Array.isArray(eng.state.meta.achievements));

// 2. 重写重置跃迁已购升级但保留核心
const eng2 = new GameEngine(lawReady(102));
eng2.state.leap.cores = 9;
eng2.state.leap.purchases.allStats = 3;
eng2.state.leap.purchases.newWorld = 1;
eng2.rewriteLaw();
check("重写重置跃迁已购升级", Object.keys(eng2.state.leap.purchases).length === 0);
check("未花费核心保留", eng2.state.leap.cores === 9);

// 3. 商店
check("补丁价格 1/2/3/5/8/13（斐波那契）", [0,1,2,3,4,5].map((l) => lawShopCostFrom(l, "critExp")).join(",") === "1,2,3,5,8,13");
check("金币转伤固定价格 3", lawShopCostFrom(0, "goldToDmg") === 3);

// 4. 公式补丁
const st3 = lawReady(103);
st3.laws.purchases.critExp = 6;
st3.laws.purchases.goldExp = 6;
st3.laws.purchases.apsCap = 4;
const d = computeDerived(st3, emptyBuffs(), 0);
check("暴击指数满级 ^1.3（2^1.3≈2.46）", Math.abs(d.critDamage - Math.pow(2, 1.3)) < 1e-9, "critDamage=" + d.critDamage.toFixed(3));
check("金币指数上限 0.98", Math.abs(lawGoldExp(st3) - 0.98) < 1e-9);
const gUp = enemyGold(10, CONFIG.HP_GROWTH, lawGoldExp(st3));
const gBase = enemyGold(10, CONFIG.HP_GROWTH, CONFIG.GOLD_HP_EXPONENT);
check("金币指数提升怪物金币", gUp.gt(gBase));
check("攻速破限 +4", lawApsCapAdd(st3) === 4);
check("攻速破限提升有效攻速", effectiveAps(30, 4) > effectiveAps(30));

// 5. 金币转伤（公式开关）
const st4 = lawReady(104);
st4.player.gold = [1, 14];
const before = computeDerived(st4, emptyBuffs(), 0).damagePerHit;
st4.laws.purchases.goldToDmg = 1;
const after = computeDerived(st4, emptyBuffs(), 0).damagePerHit;
check("金币转伤解锁后伤害提升", after.gt(before));
st4.player.gold = [1, 72];
const capped = lawGoldToDmgMult(st4).toNumber();
check("金币转伤有界（上限 1.1^60≈304）", Math.abs(capped - Math.pow(1.1, 60)) < 1e-6, "mult=" + capped.toFixed(2));

// 6. 存档兼容
const raw = lawReady(105);
const json = JSON.parse(JSON.stringify(raw));
delete json.laws;
const norm = normalizeState(json);
check("旧存档补齐 laws", norm.laws !== undefined && norm.laws.shards === 0 && Object.keys(norm.laws.purchases).length === 0);

// 7. 解锁门控
const st6 = new GameEngine(lawReady(106));
st6.state.combat.stage = CONFIG.LAWS.REWRITE_STAGE - 1;
check("未达 30000 不可重写", !st6.canRewriteLaw());

console.log(failed ? "V2 验收失败" : "V2 验收通过 ✓（法则重写/法则碎片/公式补丁）");
process.exit(failed ? 1 : 0);
