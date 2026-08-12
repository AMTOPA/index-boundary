import { CONFIG } from "../config";
import type { ChallengeId, GameState } from "../types";

export const BASE_CHALLENGE_IDS = Object.keys(CONFIG.CHALLENGES) as ChallengeId[];

export function challengeCycleTalentTotal(state: GameState): number {
  return BASE_CHALLENGE_IDS.reduce(
    (sum, id) => sum + Math.max(0, Math.floor(state.challenges[id]?.cycleTalentRewarded ?? 0)),
    0,
  );
}

export function challengeCycleTalentRemaining(state: GameState): number {
  return Math.max(0, CONFIG.CHALLENGE_TALENT_TOTAL_CAP_PER_CYCLE - challengeCycleTalentTotal(state));
}

export function challengeTalentPotential(state: GameState, ids: ChallengeId[]): number {
  const unique = Array.from(new Set(ids)).filter((id) => Boolean(CONFIG.CHALLENGES[id]));
  let remaining = challengeCycleTalentRemaining(state);
  let reward = 0;
  for (const id of unique) {
    if (remaining <= 0) break;
    const current = Math.max(0, Math.floor(state.challenges[id]?.cycleTalentRewarded ?? 0));
    const add = Math.min(
      CONFIG.CHALLENGES[id].rewardTalent,
      CONFIG.CHALLENGE_TALENT_CAP_PER_CYCLE - current,
      remaining,
    );
    if (add <= 0) continue;
    reward += add;
    remaining -= add;
  }
  return reward;
}

export function resetTalentRewardCycle(state: GameState): void {
  for (const id of BASE_CHALLENGE_IDS) {
    const progress = state.challenges[id];
    if (!progress) continue;
    progress.cycleTalentRewarded = 0;
    progress.runRewardClaimed = false;
  }
}
