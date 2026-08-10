// 每日任务系统：跨天重置、随机抽取、仅在线进度
import { CONFIG } from "../config";
import { Big, toBig } from "../bignum";
import { Rng } from "../rng";
import type { DailyState, GameState } from "../types";

export function todayStr(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function rollDaily(date: string, seed: number): DailyState {
  const pool = CONFIG.DAILY.POOL;
  const rng = new Rng(seed >>> 0);
  const chosen = rng.shuffle([...pool]).slice(0, CONFIG.DAILY.QUESTS_PER_DAY);
  const quests = chosen.map((def) => {
    const target = def.targets[Math.min(def.targets.length - 1, rng.int(0, def.targets.length - 1))];
    return { id: def.id, type: def.type, target, progress: 0, claimed: false };
  });
  return { date, quests, goldEarned: [0, 0], bestStage: 1 };
}

// 跨天自动重掷；种子 = rngState ⊕ 天数，保证同一天内稳定
export function ensureDaily(state: GameState, now = Date.now()): void {
  const t = todayStr(now);
  if (state.daily.date !== t) {
    const daySeed = (state.meta.rngState ^ Math.floor(now / 86400000)) >>> 0;
    state.daily = rollDaily(t, daySeed);
  }
}

export function dailyGoldMag(state: GameState): number {
  return toBig(state.daily.goldEarned).log10();
}