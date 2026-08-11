// 法则重写（第三层重置）：改写公式系数/指数，获得法则碎片，购买有上限的法则补丁
import { Big, toBig } from "../bignum";
import { CONFIG } from "../config";
import type { GameState, LawId } from "../types";
import { fib } from "./leap";
import { nexusShardGainMult } from "./nexus";
import { isHigherResetBlocked } from "./reset-guard";

// 重写获得碎片：floor(maxStage/10000) - 2（30000 → 1，50000 → 3，100000 → 8）
// 本次最大关卡 ≥ 上次 ×2 → 碎片翻倍
export function lawShards(state: GameState): number {
  const maxStage = state.statistics.allTimeMaxStage;
  const base = Math.max(1, Math.floor(maxStage / CONFIG.LAWS.SHARD_DIVISOR) - CONFIG.LAWS.SHARD_BASE_OFFSET);
  const last = state.laws.lastRewriteMaxStage || 1;
  const doubled = maxStage >= last * CONFIG.LAWS.DOUBLE_MULT;
  const raw = doubled ? base * CONFIG.LAWS.DOUBLE_MULT : base;
  // Nexus shard-flow upgrades further multiply law-shard output.
  return Math.floor(raw * nexusShardGainMult(state));
}

export function canRewriteLaw(state: GameState): boolean {
  return !isHigherResetBlocked(state)
    && state.meta.unlocks.includes("lawRewrite")
    && state.combat.stage >= CONFIG.LAWS.REWRITE_STAGE;
}

// 补丁价格：costBase + fib(level+1) - 1 → costBase=1: 1,2,3,5,8,13…
export function lawShopCostFrom(level: number, id: LawId): number {
  const def = CONFIG.LAWS.PATCHES[id];
  return def.costBase + fib(level + 1) - 1;
}

export function lawShopCost(state: GameState, id: LawId): number {
  return lawShopCostFrom(state.laws.purchases[id] ?? 0, id);
}

export function canBuyLaw(state: GameState, id: LawId): boolean {
  const def = CONFIG.LAWS.PATCHES[id];
  const cur = state.laws.purchases[id] ?? 0;
  if (cur >= def.max) return false;
  return state.laws.shards >= lawShopCost(state, id);
}

export function buyLawPatch(state: GameState, id: LawId): boolean {
  if (!canBuyLaw(state, id)) return false;
  const cost = lawShopCost(state, id);
  state.laws.shards -= cost;
  state.laws.purchases[id] = (state.laws.purchases[id] ?? 0) + 1;
  return true;
}

// ---- 法则生效参数（全部有硬上限）----

// 暴击指数：CritDamage^1 → ^(1+0.05/级)，上限 ^1.3
export function lawCritExp(state: GameState): number {
  const lv = state.laws.purchases.critExp ?? 0;
  return 1 + lv * CONFIG.LAWS.PATCHES.critExp.perLevel;
}

// 金币补强：独立金币倍率 +25%/级（有界，不做指数级膨胀）
export function lawGoldBoost(state: GameState): number {
  const lv = state.laws.purchases.goldBoost ?? 0;
  return 1 + lv * CONFIG.LAWS.PATCHES.goldBoost.perLevel;
}

// 攻速软上限附加：10 → 14（有界）
export function lawApsCapAdd(state: GameState): number {
  return (state.laws.purchases.apsCap ?? 0) * CONFIG.LAWS.PATCHES.apsCap.perLevel;
}

// 金币转伤（公式开关）：持有金币每高 10 倍（≥10^12）→ 全伤害 ×1.1，上限 1.1^60 ≈ 304×
export function lawGoldToDmgMult(state: GameState): Big {
  if ((state.laws.purchases.goldToDmg ?? 0) <= 0) return Big.ONE;
  const goldLog = Math.max(0, toBig(state.player.gold).log10() - CONFIG.LAWS.GOLD_TO_DMG_LOG_FLOOR);
  const capped = Math.min(goldLog, CONFIG.LAWS.GOLD_TO_DMG_MAX_LOG);
  return Big.fromNumber(Math.pow(1 + CONFIG.LAWS.GOLD_TO_DMG_PER_STEP, capped));
}

// 执行法则重写（engine 调用前已校验 canRewriteLaw）
export function applyLawRewrite(state: GameState, shardsGained: number): void {
  const lw = state.laws;
  lw.shards += shardsGained;
  lw.totalShardsEarned += shardsGained;
  lw.totalRewrites += 1;
  lw.lastRewriteMaxStage = state.statistics.allTimeMaxStage;

  // ---- 第三层洗牌：重置关卡/金币/升级/装备/技能/天赋/重构 ----
  state.combat = {
    stage: 1,
    enemyHp: [0, 0],
    enemyMaxHp: [0, 0],
    isBoss: false,
    bossAffixes: [],
    bossTimer: -1,
    combo: 0,
    comboTimer: 0,
    crushStreak: 0,
    skipMode: false,
    lastHitWasCrit: false,
    lastHitWasSuper: false,
    lastHitWasCrush: false,
    enemyKind: "normal",
    bossShieldHits: 0,
    bossVoidTarget: null,
  };
  state.player.gold = [0, 0];
  state.player.upgrades = { attack: 0, aspd: 0, critChance: 0, critDamage: 0, gold: 0 };
  state.equipment = { slots: {}, inventory: [], fragments: [0, 0], autoBreakdown: null };
  state.skills = { actives: [], passives: { rhythm: 0, focus: 0, greed: 0 }, cores: [0, 0] };
  state.talents = { ...state.talents, points: 0, allocations: {}, keystones: {} };
  state.prestige = { energy: 0, totalEnergyEarned: 0, nextRequiredStage: CONFIG.PRESTIGE.BASE_STAGE, purchases: {} };
  // ---- 重置第二层跃迁的已购升级（保留未花费的核心）----
  state.leap.nextRequiredStage = CONFIG.LEAP.STAGE;
  state.leap.purchases = {};
  state.statistics.runDamage = [0, 0];
  // 保留：成就/统计/世界核心/法则碎片/工具/元数据
}
