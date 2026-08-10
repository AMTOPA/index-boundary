"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GameEngine, type OfflineResult } from "@/game/engine";
import { gameStore, derivedStore } from "@/game/gameStore";
import { loadGame, saveGame } from "@/game/save";
import { initAudio, playSfx } from "@/game/audio";
import { initCloud, uploadSave, fetchCloudSave, leaderboardMetrics, submitScore } from "@/game/cloud";
import type { GameEvent, GameState } from "@/game/types";
import { CONFIG } from "@/game/config";
import { OfflineModal } from "@/components/common/OfflineModal";

interface ToastItem { id: number; text: string; kind: string }
interface GameCtx {
  engine: GameEngine | null;
  toasts: ToastItem[];
  pushToast: (text: string, kind?: string) => void;
  unlockCard: string | null;
  milestoneFlash: number | null;
  offline: OfflineResult | null;
  reload: (state: GameState) => void;
}
const Ctx = createContext<GameCtx>({
  engine: null, toasts: [], pushToast: () => {}, unlockCard: null, milestoneFlash: null, offline: null,
  reload: () => {},
});
export const useGame = () => useContext(Ctx);

let toastId = 0;

export function GameProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [unlockCard, setUnlockCard] = useState<string | null>(null);
  const [milestoneFlash, setMilestoneFlash] = useState<number | null>(null);
  const [offline, setOffline] = useState<OfflineResult | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const mountedRef = useRef(true);
  const startToken = useRef(0);

  const pushToast = useCallback((text: string, kind = "info") => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-4), { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const stopEngine = useCallback(() => {
    const eng = engineRef.current;
    if (eng) saveGame(eng.state);
    for (const fn of cleanupRef.current) fn();
    cleanupRef.current = [];
    engineRef.current = null;
  }, []);

  const start = useCallback(async (initialState?: GameState) => {
    const token = ++startToken.current;
    stopEngine();
    setEngine(null);
    setOffline(null);
    initAudio();

    let state: GameState | null = initialState ?? null;
    if (!state) {
      const loaded = loadGame();
      state = loaded ? loaded.state : null;
    }
    await initCloud();
    if (!mountedRef.current || token !== startToken.current) return;
    const cloud = await fetchCloudSave();
    if (!mountedRef.current || token !== startToken.current) return;
    if (cloud) {
      const localT = state?.meta.cloudSyncedAt ?? 0;
      if (localT < (cloud.meta.cloudSyncedAt ?? 0)) state = cloud;
    }

    const eng = new GameEngine(state ?? undefined);
    engineRef.current = eng;

    const unsub = eng.onEvent((ev: GameEvent) => {
      switch (ev.type) {
        case "crit": playSfx(ev.super ? "superCrit" : "crit"); break;
        case "crush": playSfx("crush"); break;
        case "bossSpawn": playSfx("boss"); break;
        case "bossKill": playSfx("bossKill"); break;
        case "bossFail":
          playSfx("error");
          pushToast("Boss 战失败，退回前一关刷资源", "danger");
          break;
        case "unlock":
          playSfx("unlock");
          setUnlockCard(ev.label);
          window.setTimeout(() => setUnlockCard((v) => (v === ev.label ? null : v)), 2300);
          break;
        case "milestone":
          playSfx("milestone");
          setMilestoneFlash(ev.magnitude);
          window.setTimeout(() => setMilestoneFlash((v) => (v === ev.magnitude ? null : v)), 2700);
          break;
        case "prestige":
          playSfx("prestige");
          pushToast(`重构完成！获得 ${ev.energyGained} 奇点能量`, "energy");
          break;
        case "achievement":
          pushToast(`成就达成：${ev.id}`, "achievement");
          break;
        case "challengeStart":
          pushToast("挑战开启：本局已重置，注意修饰符生效", "info");
          break;
        case "challengeClaim":
          playSfx("unlock");
          pushToast("挑战通关！奖励已发放", "achievement");
          break;
        case "dailyClaim":
          playSfx("upgrade");
          pushToast("每日任务完成，奖励已发放", "info");
          break;
        case "drop": playSfx("drop"); break;
        case "levelUp": playSfx("upgrade"); break;
        default: break;
      }
    });
    cleanupRef.current.push(unsub);

    const off = eng.handleOffline(Date.now());
    if (off && off.secondsSimulated > 0) setOffline(off);
    gameStore.setState(eng.state);
    derivedStore.setState({ v: derivedStore.getState().v + 1, derived: eng.derived });
    setEngine(eng);

    const tickIv = window.setInterval(() => {
      eng.tick(1 / CONFIG.TICK_RATE);
      gameStore.setState(eng.state);
    }, 1000 / CONFIG.TICK_RATE);
    cleanupRef.current.push(() => window.clearInterval(tickIv));

    const derivedIv = window.setInterval(() => {
      derivedStore.setState({ v: derivedStore.getState().v + 1, derived: eng.derived });
    }, 500);
    cleanupRef.current.push(() => window.clearInterval(derivedIv));

    const saveIv = window.setInterval(() => saveGame(eng.state), CONFIG.SAVE_INTERVAL_MS);
    cleanupRef.current.push(() => window.clearInterval(saveIv));

    const cloudIv = window.setInterval(() => void uploadSave(eng.state), 5000);
    cleanupRef.current.push(() => window.clearInterval(cloudIv));

    const lbIv = window.setInterval(() => {
      void (async () => {
        const m = leaderboardMetrics(eng.state);
        await submitScore(eng.state, "stage", m.stage, m.stage);
        await submitScore(eng.state, "mag", m.mag, m.stage);
        await submitScore(eng.state, "prestige", m.prestige, m.stage);
      })();
    }, 60000);
    cleanupRef.current.push(() => window.clearInterval(lbIv));

    const onHide = () => { saveGame(eng.state); void uploadSave(eng.state); };
    const onUnload = () => { saveGame(eng.state); };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        eng.click();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("keydown", onKey);
    cleanupRef.current.push(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("keydown", onKey);
    });

    // 首次交互解锁音频
    const onFirstInteract = () => { initAudio(); };
    window.addEventListener("pointerdown", onFirstInteract, { once: true });
    cleanupRef.current.push(() => window.removeEventListener("pointerdown", onFirstInteract));
  }, [pushToast, stopEngine]);

  const reload = useCallback((state: GameState) => { void start(state); }, [start]);

  useEffect(() => {
    mountedRef.current = true;
    void start();
    return () => {
      mountedRef.current = false;
      stopEngine();
    };
  }, [start, stopEngine]);

  return (
    <Ctx.Provider value={{ engine, toasts, pushToast, unlockCard, milestoneFlash, offline, reload }}>
      {children}
      {offline && <OfflineModal result={offline} onClose={() => setOffline(null)} />}
      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
      {unlockCard && (
        <div className="unlock-card">
          <div className="unlock-inner">
            <div className="big">解锁</div>
            <div className="sub">{unlockCard}</div>
          </div>
        </div>
      )}
      {milestoneFlash !== null && (
        <div className="milestone-flash">
          <div className="milestone-inner">
            <div className="mag mono">10^{milestoneFlash}</div>
            <div className="sub">伤害数量级突破！</div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}