"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { gameStore, derivedStore } from "@/game/gameStore";
import type { DerivedStats, GameState } from "@/game/types";

export function useGameSelector<T>(selector: (state: GameState) => T): T {
  return useSyncExternalStore(
    (notify) => gameStore.subscribe(selector, () => notify()),
    () => selector(gameStore.getState()),
    () => selector(gameStore.getState()),
  );
}

export function useDerived(): DerivedStats {
  useSyncExternalStore(
    (notify) => derivedStore.subscribe((state) => state.v, () => notify()),
    () => derivedStore.getState().v,
    () => derivedStore.getState().v,
  );
  return derivedStore.getState().derived;
}

/** Prefer useGameSelector for new UI so unrelated 10 Hz updates do not re-render it. */
export function useGameState(): GameState {
  return useSyncExternalStore(
    (notify) => gameStore.subscribe((state) => state, () => notify()),
    () => gameStore.getState(),
    () => gameStore.getState(),
  );
}

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    update();
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return visible;
}

/** Combines the saved preference with the operating-system accessibility preference. */
export function useReducedMotion(): boolean {
  const savedPreference = useGameSelector((state) => state.meta.settings.reduceMotion);
  const [systemPreference, setSystemPreference] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemPreference(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return savedPreference || systemPreference;
}


export function useAnimationFps(): 30 | 60 | 120 {
  return useGameSelector((state) => state.meta.settings.animationFps ?? 60);
}
