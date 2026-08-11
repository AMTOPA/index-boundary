import type { GameState } from "../types";

// 挑战与赛季使用临时规则运行，不允许从中带出任何永久重置货币或维度进度。
export function isHigherResetBlocked(state: GameState): boolean {
  return state.meta.activeChallenge !== null || state.meta.activeModifiers.length > 0;
}
