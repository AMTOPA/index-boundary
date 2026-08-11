// 世界跃迁（第二层重置）：跨世界线洗牌，获得世界核心，购买世界核心升级
import { Big, toBig } from "../bignum";
import { CONFIG } from "../config";
import type { GameState, LeapUpgradeId } from "../types";
import { SKILL_DEFS } from "../data/skills";
import { isHigherResetBlocked } from "./reset-guard";

export interface LeapResult {
  coresGained: number;
}

// 本轮世界线超过固定门槛时获得额外核心；不再随上次最高关翻倍抬高门槛。
export function leapBonusCoresForStage(stage: number): number {
  const safeStage = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  if (safeStage < CONFIG.LEAP.CORE_BONUS_STAGE) return 0;
  return 1 + Math.floor((safeStage - CONFIG.LEAP.CORE_BONUS_STAGE) / CONFIG.LEAP.CORE_BONUS_STEP);
}

export function leapCoresForStage(stage: number): number {
  return CONFIG.LEAP.CORE_PER_LEAP + leapBonusCoresForStage(stage);
}

export function leapCores(state: GameState): number {
  return leapCoresForStage(state.combat.stage);
}

export function leapStageRequirement(state: GameState): number {
  const stored = Math.floor(state.leap.nextRequiredStage || CONFIG.LEAP.STAGE);
  return Math.min(CONFIG.LEAP.MAX_STAGE_REQUIREMENT, Math.max(CONFIG.LEAP.STAGE, stored));
}

export function canLeap(state: GameState): boolean {
  return !isHigherResetBlocked(state)
    && state.meta.unlocks.includes("leap")
    && state.combat.stage >= leapStageRequirement(state);
}

// Fibonacci 价格：level n（0 起）→ fib(n+2)：1,2,3,5,8,13…
export function fib(n: number): number {
  let a = 1, b = 1;
  for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; }
  return a;
}

export function leapShopCostFrom(level: number, id: LeapUpgradeId): number {
  const def = CONFIG.LEAP.SHOP[id];
  void def;
  return fib(level + 1); // level0→fib2=1, level1→fib3=2 …
}

export function leapShopCost(state: GameState, id: LeapUpgradeId): number {
  return leapShopCostFrom(state.leap.purchases[id] ?? 0, id);
}

export function canBuyLeap(state: GameState, id: LeapUpgradeId): boolean {
  const def = CONFIG.LEAP.SHOP[id];
  const cur = state.leap.purchases[id] ?? 0;
  if (cur >= def.max) return false;
  return state.leap.cores >= leapShopCost(state, id);
}

export function buyLeapUpgrade(state: GameState, id: LeapUpgradeId): boolean {
  if (!canBuyLeap(state, id)) return false;
  const cost = leapShopCost(state, id);
  state.leap.cores -= cost;
  state.leap.purchases[id] = (state.leap.purchases[id] ?? 0) + 1;
  return true;
}

// 跃迁后起始关卡（起始世界升级 ×100）
export function leapStartStage(state: GameState): number {
  const lv = state.leap.purchases.startStage ?? 0;
  return Math.min(CONFIG.LEAP.STAGE - 1, 1 + lv * CONFIG.LEAP.SHOP.startStage.perLevel);
}

// Starting at stage x + 1 grants level x in every base upgrade.
export function leapStartUpgradeLevel(state: GameState): number {
  return Math.max(0, leapStartStage(state) - 1);
}

// 全属性：每一级都会立即提升，全局伤害与金币按 ×1.3 乘算叠加。
export function leapAllStatsMult(level: number): Big {
  const safeLevel = Math.max(0, Math.min(CONFIG.LEAP.SHOP.allStats.max, Math.floor(level)));
  return Big.fromNumber(CONFIG.LEAP.SHOP.allStats.perLevel).pow(safeLevel);
}

// 生效的怪物 HP 成长指数（法则指数 -0.005/级，上限 -0.12）
export function effectiveHpGrowth(state: GameState): number {
  const lawLv = state.leap.purchases.lawExponent ?? 0;
  const lawReduction = Math.min(0.12, lawLv * CONFIG.LEAP.SHOP.lawExponent.perLevel);
  // 奇点天赋「法则扭曲」再降（systems 里由 computeDerived 汇总，这里只算世界核心部分）
  return CONFIG.HP_GROWTH - lawReduction;
}

// 执行跃迁（engine 调用前已校验 canLeap）
export function applyLeap(state: GameState, coresGained: number): void {
  const l = state.leap;
  l.cores += coresGained;
  l.totalCoresEarned += coresGained;
  l.totalLeaps += 1;
  l.lastLeapMaxStage = state.combat.stage;
  l.nextRequiredStage = Math.min(
    CONFIG.LEAP.MAX_STAGE_REQUIREMENT,
    leapStageRequirement(state) + CONFIG.LEAP.STAGE_PER_LEAP,
  );

  // ---- 彻底洗牌：重置升级/金币/关卡/装备/技能/天赋/重构 ----
  const startStage = leapStartStage(state);
  const startUpgradeLevel = leapStartUpgradeLevel(state);
  state.combat = {
    stage: startStage,
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
  state.player.upgrades = {
    attack: startUpgradeLevel,
    aspd: startUpgradeLevel,
    critChance: startUpgradeLevel,
    critDamage: startUpgradeLevel,
    gold: startUpgradeLevel,
  };
  state.equipment = { slots: {}, inventory: [], fragments: [0, 0], autoBreakdown: null };
  state.skills = { actives: [], passives: { rhythm: 0, focus: 0, greed: 0 }, cores: [0, 0] };
  state.talents = { ...state.talents, points: 0, allocations: {}, keystones: {} };
  state.prestige = { energy: 0, totalEnergyEarned: 0, nextRequiredStage: CONFIG.PRESTIGE.BASE_STAGE, purchases: {} };
  state.statistics.runDamage = [0, 0];
  // 保留：成就/统计/世界核心/元数据解锁/工具（永久基础设施）
}
