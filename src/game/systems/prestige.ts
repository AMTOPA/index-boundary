// 重构系统（第一层重置）：能量结算 / 永久升级 / 重置清单
import { Big } from "../bignum";
import { CONFIG } from "../config";
import type { GameState, PrestigeUpgradeId, SkillId } from "../types";
import { prestigeEnergy } from "../formulas";
import { SKILL_DEFS } from "../data/skills";

export interface PrestigeResult {
  energyGained: number;
  goldKept: Big;
}

export function computePrestige(state: GameState): PrestigeResult {
  const energy = prestigeEnergy(Big.fromTuple(state.statistics.runDamage));
  const keepPct = (state.prestige.purchases.goldKeep ?? 0) * CONFIG.PRESTIGE.SHOP.goldKeep.perLevel;
  const goldKept = Big.fromTuple(state.player.gold).mul(Big.fromNumber(Math.min(0.5, keepPct)));
  return { energyGained: energy, goldKept };
}

export function prestigeStageRequirement(state: GameState): number {
  const stored = Math.floor(state.prestige.nextRequiredStage || CONFIG.PRESTIGE.BASE_STAGE);
  return Math.min(CONFIG.PRESTIGE.MAX_STAGE_REQUIREMENT, Math.max(CONFIG.PRESTIGE.BASE_STAGE, stored));
}

export function canPrestige(state: GameState): boolean {
  if (state.meta.activeChallenge !== null || state.meta.activeModifiers.length > 0) return false;
  return state.combat.stage >= prestigeStageRequirement(state)
    && prestigeEnergy(Big.fromTuple(state.statistics.runDamage)) > 0;
}

// 执行重构（engine 在调用前已计算并保存 derived 快照用于结算）
export function applyPrestige(state: GameState, energyGained: number, goldKept: Big): void {
  const p = state.prestige;
  p.energy += energyGained;
  p.totalEnergyEarned += energyGained;
  state.statistics.totalPrestiges += 1;
  p.nextRequiredStage = Math.min(
    CONFIG.PRESTIGE.MAX_STAGE_REQUIREMENT,
    prestigeStageRequirement(state) + CONFIG.PRESTIGE.STAGE_PER_PRESTIGE,
  );
  state.statistics.runDamage = [0, 0]; // 本局伤害清零（重构按本局结算）

  // ---- 重置清单 ----
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
  // 金币保留
  state.player.gold = goldKept.toTuple();
  // 升级重置（起始力量生效）
  const startLv = (p.purchases.startPower ?? 0) * CONFIG.PRESTIGE.SHOP.startPower.perLevel;
  state.player.upgrades = {
    attack: startLv,
    aspd: 0,
    critChance: 0,
    critDamage: 0,
    gold: 0,
  };
  // 解锁重置：只保留剧情性解锁（装备/技能/天赋/重构），清空关卡进度解锁
  const kept = ["equipment", "skills", "talents", "prestige", "achievements"];
  state.meta.unlocks = state.meta.unlocks.filter((u) => kept.includes(u) || u.startsWith("tool_") || u.startsWith("talent_unlock_"));
  // 初始技能（重构商店）
  if ((p.purchases.startSkill ?? 0) >= 1 && !state.skills.actives.some((s) => s.id === "overclock")) {
    const def = SKILL_DEFS.overclock;
    state.skills.actives.unshift({
      id: "overclock",
      level: 1,
      cdRemaining: 0,
      activeUntil: 0,
      active: false,
    });
  }
  // 技能冷却清零
  for (const inst of state.skills.actives) {
    inst.cdRemaining = 0;
    inst.active = false;
    inst.activeUntil = 0;
  }
  // 装备/技能/天赋/数据碎片 保留（不重置）
}

// ---------------- 重构商店 ----------------

export function shopCostFrom(energy: number, purchases: Partial<Record<PrestigeUpgradeId, number>>, id: PrestigeUpgradeId): number {
  const def = CONFIG.PRESTIGE.SHOP[id];
  const cur = purchases[id] ?? 0;
  return Math.ceil(def.baseCost * Math.pow(def.costGrowth, cur));
}

export function shopCost(state: GameState, id: PrestigeUpgradeId): number {
  return shopCostFrom(state.prestige.energy, state.prestige.purchases, id);
}

export function canBuyFrom(energy: number, purchases: Partial<Record<PrestigeUpgradeId, number>>, id: PrestigeUpgradeId): boolean {
  const def = CONFIG.PRESTIGE.SHOP[id];
  const cur = purchases[id] ?? 0;
  if (cur >= def.max) return false;
  return energy >= shopCostFrom(energy, purchases, id);
}

export function canBuy(state: GameState, id: PrestigeUpgradeId): boolean {
  const def = CONFIG.PRESTIGE.SHOP[id];
  const cur = state.prestige.purchases[id] ?? 0;
  if (cur >= def.max) return false;
  return state.prestige.energy >= shopCost(state, id);
}

export function buyPrestigeUpgrade(state: GameState, id: PrestigeUpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  const cost = shopCost(state, id);
  state.prestige.energy -= cost;
  state.prestige.purchases[id] = (state.prestige.purchases[id] ?? 0) + 1;
  return true;
}

export function initialSkillsForPrestige(): SkillId[] {
  return ["overclock"];
}