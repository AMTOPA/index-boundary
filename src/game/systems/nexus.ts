// 第 4 维度：法则彼岸（Nexus）——三层世界跃迁全部完成后的下一个阶段
// 进入门槛 = 收集足够法则碎片（不看关卡），进入后货币 = 法则碎片
import { Big, toBig } from "../bignum";
import { CONFIG } from "../config";
import type { GameState, NexusUpgradeId } from "../types";
import { fib } from "./leap";
import { isHigherResetBlocked } from "./reset-guard";

// 彼岸增幅：全局伤害 ×1.5/级（独立乘区）
export function nexusDmgMult(state: GameState): Big {
  const lv = state.nexus?.purchases?.nexusDmg ?? 0;
  return Big.fromNumber(Math.pow(1 + CONFIG.NEXUS.SHOP.nexusDmg.perLevel, lv));
}

// 彼岸金流：金币收益 ×1.5/级（独立乘区）
export function nexusGoldMult(state: GameState): Big {
  const lv = state.nexus?.purchases?.nexusGold ?? 0;
  return Big.fromNumber(Math.pow(1 + CONFIG.NEXUS.SHOP.nexusGold.perLevel, lv));
}

// 碎片洪流：法则碎片获取 ×1.25/级（影响 lawShards 产出）
export function nexusShardGainMult(state: GameState): number {
  const lv = state.nexus?.purchases?.nexusShardGain ?? 0;
  return Math.pow(1 + CONFIG.NEXUS.SHOP.nexusShardGain.perLevel, lv);
}

// 溢出洪流：溢出收益 ×1.5/级
export function nexusOverflowMult(state: GameState): Big {
  const lv = state.nexus?.purchases?.nexusOverflow ?? 0;
  return Big.fromNumber(Math.pow(1 + CONFIG.NEXUS.SHOP.nexusOverflow.perLevel, lv));
}

// 是否已具备进入彼岸的条件（三层跃迁完成 + 持有足够法则碎片）
export function nexusReady(state: GameState): boolean {
  return state.combat.stage >= CONFIG.NEXUS.ENTRY_STAGE
    && (state.leap?.purchases?.newWorld ?? 0) >= CONFIG.NEXUS.REQUIRED_NEW_WORLD
    && toBig(state.laws.shards).gte(Big.fromNumber(CONFIG.NEXUS.ENTRY_SHARDS));
}

export function canEnterNexus(state: GameState): boolean {
  return !isHigherResetBlocked(state) && !state.nexus?.entered && nexusReady(state);
}

// 跨入彼岸：消耗碎片，进入第 4 维度
export function enterNexus(state: GameState): boolean {
  if (!canEnterNexus(state)) return false;
  state.laws.shards = toBig(state.laws.shards).sub(Big.fromNumber(CONFIG.NEXUS.ENTRY_COST)).toNumber();
  state.nexus.unlocked = true;
  state.nexus.entered = true;
  state.nexus.dimension = 1;
  state.nexus.bossAutoAttack = true; // 旧存档兼容；实际自动攻击由 auto_attack 统一控制
  return true;
}

// ---- 彼岸商店（法则碎片购买，斐波那契递增）----
export function nexusShopCostFrom(level: number, id: NexusUpgradeId): number {
  const def = CONFIG.NEXUS.SHOP[id];
  return def.costBase + fib(level + 1) - 1;
}

export function nexusShopCost(state: GameState, id: NexusUpgradeId): number {
  return nexusShopCostFrom(state.nexus.purchases[id] ?? 0, id);
}

export function canBuyNexus(state: GameState, id: NexusUpgradeId): boolean {
  if (!state.nexus.entered) return false;
  const def = CONFIG.NEXUS.SHOP[id];
  const cur = state.nexus.purchases[id] ?? 0;
  if (cur >= def.max) return false;
  return state.laws.shards >= nexusShopCost(state, id);
}

export function buyNexusUpgrade(state: GameState, id: NexusUpgradeId): boolean {
  if (!canBuyNexus(state, id)) return false;
  const cost = nexusShopCost(state, id);
  state.laws.shards -= cost;
  state.nexus.purchases[id] = (state.nexus.purchases[id] ?? 0) + 1;
  return true;
}
