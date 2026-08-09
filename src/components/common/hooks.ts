"use client";
import { useSyncExternalStore } from "react";
import { gameStore, derivedStore } from "@/game/gameStore";
import type { GameState } from "@/game/types";
import type { DerivedStats } from "@/game/types";

export function useGameSelector<T>(selector: (s: GameState) => T): T {
  return useSyncExternalStore(
    (cb) => gameStore.subscribe(selector, () => cb()),
    () => selector(gameStore.getState()),
    () => selector(gameStore.getState())
  );
}

export function useDerived(): DerivedStats {
  useSyncExternalStore(
    (cb) => derivedStore.subscribe((s) => s.v, () => cb()),
    () => derivedStore.getState().v,
    () => derivedStore.getState().v
  );
  return derivedStore.getState().derived;
}

export function useGameState(): GameState {
  return useSyncExternalStore(
    (cb) => gameStore.subscribe((s) => s, () => cb()),
    () => gameStore.getState(),
    () => gameStore.getState()
  );
}