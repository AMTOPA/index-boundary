import { createStore } from "./store";
import { createNewState } from "./engine";
import type { DerivedStats, GameState } from "./types";
import { computeDerived, emptyBuffs } from "./formulas";

/** The engine remains at 20 TPS, while React-facing state is capped at 8 FPS. */
export const GAME_UI_PUBLISH_INTERVAL_MS = 125;

export const gameStore = createStore<GameState>(createNewState());
export const derivedStore = createStore<{ v: number; derived: DerivedStats }>({
  v: 0,
  derived: computeDerived(gameStore.getState(), emptyBuffs(), 0),
});

let lastGamePublishAt = -Infinity;

/**
 * Publish the mutable engine state to React subscribers without coupling engine TPS
 * to render frequency. `force` is intended for user actions, lifecycle changes and loads.
 */
export function publishGameState(state: GameState, force = false, now = Date.now()): boolean {
  if (!force && now - lastGamePublishAt < GAME_UI_PUBLISH_INTERVAL_MS) return false;
  lastGamePublishAt = now;
  gameStore.setState(state);
  return true;
}

export function publishDerivedStats(derived: DerivedStats): void {
  derivedStore.setState((current) => ({ v: current.v + 1, derived }));
}
