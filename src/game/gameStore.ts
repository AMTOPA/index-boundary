// 应用状态桥接：GameState store + DerivedStats store（与引擎分离）
import { createStore } from "./store";
import { createNewState } from "./engine";
import type { GameState } from "./types";
import { computeDerived, emptyBuffs } from "./formulas";
import type { DerivedStats } from "./types";

export const gameStore = createStore<GameState>(createNewState());
export const derivedStore = createStore<{ v: number; derived: DerivedStats }>({
  v: 0,
  derived: computeDerived(gameStore.getState(), emptyBuffs(), 0),
});