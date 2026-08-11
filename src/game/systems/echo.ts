// 第 5 维度：超维回响（Echo）——进入法则彼岸后，收集足够「回响印记」解锁的下一维度
// 进入门槛 = 累计回响印记达标（不看关卡），进入后货币 = 回响印记
import { Big } from "../bignum";
import { CONFIG } from "../config";
import type { GameState, EchoUpgradeId } from "../types";
import { fib } from "./leap";
import { isHigherResetBlocked } from "./reset-guard";

// 回响增幅：全局伤害 ×1.5/级（独立乘区）
export function echoDmgMult(state: GameState): Big {
  const lv = state.echo?.purchases?.echoDmg ?? 0;
  return Big.fromNumber(Math.pow(1 + CONFIG.ECHO.SHOP.echoDmg.perLevel, lv));
}

// 回响金流：金币收益 ×1.5/级（独立乘区）
export function echoGoldMult(state: GameState): Big {
  const lv = state.echo?.purchases?.echoGold ?? 0;
  return Big.fromNumber(Math.pow(1 + CONFIG.ECHO.SHOP.echoGold.perLevel, lv));
}

// 印记洪流：回响印记获取 ×1.25/级
export function echoSealGainMult(state: GameState): number {
  const lv = state.echo?.purchases?.echoSealGain ?? 0;
  return Math.pow(1 + CONFIG.ECHO.SHOP.echoSealGain.perLevel, lv);
}

// 回响溢流：溢出收益 ×1.5/级
export function echoOverflowMult(state: GameState): Big {
  const lv = state.echo?.purchases?.echoOverflow ?? 0;
  return Big.fromNumber(Math.pow(1 + CONFIG.ECHO.SHOP.echoOverflow.perLevel, lv));
}

// 彼岸 Boss 掉落的回响印记：基础 + 关卡每高 10 倍 +1（指数增长跟随数量级）
export function echoSealsForBoss(stage: number): number {
  if (stage < CONFIG.ECHO.SEAL_MIN_STAGE) return 0;
  const logs = Math.max(0, Math.floor(Math.log10(stage / CONFIG.ECHO.SEAL_MIN_STAGE)));
  return CONFIG.ECHO.BOSS_SEAL_BASE + logs * CONFIG.ECHO.BOSS_SEAL_PER_LOG;
}

// 彼岸精英掉落的回响印记（固定）
export function echoSealsForElite(stage: number): number {
  return stage >= CONFIG.ECHO.SEAL_MIN_STAGE ? CONFIG.ECHO.ELITE_SEAL : 0;
}

// 是否已具备进入超维回响的条件（彼岸已进入 + 累计印记达标，不看关卡）
export function echoReady(state: GameState): boolean {
  return !!state.nexus?.entered
    && state.combat.stage >= CONFIG.ECHO.ENTRY_STAGE
    && state.echo.totalSealsEarned >= CONFIG.ECHO.ENTRY_SEALS
    && state.echo.seals >= CONFIG.ECHO.ENTRY_COST;
}

export function canEnterEcho(state: GameState): boolean {
  return !isHigherResetBlocked(state) && !state.echo?.entered && echoReady(state);
}

// 跨入超维回响：消耗印记，进入第 5 维度
export function enterEcho(state: GameState): boolean {
  if (!canEnterEcho(state)) return false;
  state.echo.seals = Math.max(0, state.echo.seals - CONFIG.ECHO.ENTRY_COST);
  state.echo.unlocked = true;
  state.echo.entered = true;
  state.echo.dimension = 1;
  return true;
}

// ---- 回响商店（回响印记购买，斐波那契递增）----
export function echoShopCostFrom(level: number, id: EchoUpgradeId): number {
  const def = CONFIG.ECHO.SHOP[id];
  return def.costBase + fib(level + 1) - 1;
}

export function echoShopCost(state: GameState, id: EchoUpgradeId): number {
  return echoShopCostFrom(state.echo.purchases[id] ?? 0, id);
}

export function canBuyEcho(state: GameState, id: EchoUpgradeId): boolean {
  if (!state.echo.entered) return false;
  const def = CONFIG.ECHO.SHOP[id];
  const cur = state.echo.purchases[id] ?? 0;
  if (cur >= def.max) return false;
  return state.echo.seals >= echoShopCost(state, id);
}

export function buyEchoUpgrade(state: GameState, id: EchoUpgradeId): boolean {
  if (!canBuyEcho(state, id)) return false;
  const cost = echoShopCost(state, id);
  state.echo.seals -= cost;
  state.echo.purchases[id] = (state.echo.purchases[id] ?? 0) + 1;
  return true;
}