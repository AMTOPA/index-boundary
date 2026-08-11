"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GameEngine, type OfflineResult } from "@/game/engine";
import { gameStore, publishDerivedStats, publishGameState } from "@/game/gameStore";
import { worldForStage } from "@/game/data/worlds";
import { loadGame, saveGame } from "@/game/save";
import { initAudio, playSfx, setAudioEnabled } from "@/game/audio";
import { initCloud, uploadSave, fetchCloudSave, leaderboardMetrics, submitScore } from "@/game/cloud";
import type { GameEvent, GameState } from "@/game/types";
import { CONFIG } from "@/game/config";
import { OfflineModal } from "@/components/common/OfflineModal";

interface ToastItem { id: number; text: string; kind: string }
type GameSettings = GameState["meta"]["settings"];
interface GameCtx {
  engine: GameEngine | null;
  toasts: ToastItem[];
  pushToast: (text: string, kind?: string) => void;
  unlockCard: string | null;
  milestoneFlash: number | null;
  offline: OfflineResult | null;
  worldFlash: { name: string; color: string } | null;
  reload: (state: GameState) => void;
  updateSettings: (patch: Partial<GameSettings>) => void;
}
const Ctx = createContext<GameCtx>({
  engine: null, toasts: [], pushToast: () => {}, unlockCard: null, milestoneFlash: null, offline: null,
  worldFlash: null,
  reload: () => {},
  updateSettings: () => {},
});
export const useGame = () => useContext(Ctx);

let toastId = 0;

export function GameProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [unlockCard, setUnlockCard] = useState<string | null>(null);
  const [milestoneFlash, setMilestoneFlash] = useState<number | null>(null);
  const [leapFlash, setLeapFlash] = useState<number | null>(null);
  const [lawFlash, setLawFlash] = useState<number | null>(null);
  const [prestigeFlash, setPrestigeFlash] = useState<number | null>(null);
  const [nexusFlash, setNexusFlash] = useState<number | null>(null);
  const [echoFlash, setEchoFlash] = useState<number | null>(null);
  const [worldFlash, setWorldFlash] = useState<{ name: string; color: string } | null>(null);
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

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.state.meta.settings = { ...eng.state.meta.settings, ...patch };
    setAudioEnabled(eng.state.meta.settings.sound);
    syncReducedMotion(eng.state.meta.settings.reduceMotion);
    publishGameState(eng.state, true);
    saveGame(eng.state);
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
    setAudioEnabled(eng.state.meta.settings.sound);
    syncReducedMotion(eng.state.meta.settings.reduceMotion);

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
        case "leap":
          playSfx("prestige");
          pushToast("世界跃迁！获得 " + ev.cores + " 世界核心，进入新世界线", "energy");
          setLeapFlash(ev.cores);
          window.setTimeout(() => setLeapFlash((v) => (v === ev.cores ? null : v)), 2800);
          break;
        case "lawRewrite":
          playSfx("prestige");
          pushToast("法则重写！获得 " + ev.shards + " 法则碎片，公式已被改写", "energy");
          setLawFlash(ev.shards);
          window.setTimeout(() => setLawFlash((v) => (v === ev.shards ? null : v)), 2800);
          break;
        case "prestige":
          playSfx("prestige");
          pushToast(`重构完成！获得 ${ev.energyGained} 奇点能量`, "energy");
          setPrestigeFlash(ev.energyGained);
          window.setTimeout(() => setPrestigeFlash((v) => (v === ev.energyGained ? null : v)), 2800);
          break;
        case "nexusEnter":
          playSfx("unlock");
          setNexusFlash(ev.dimension);
          window.setTimeout(() => setNexusFlash((v) => (v === ev.dimension ? null : v)), 3000);
          break;
        case "echoSeal":
          pushToast("+" + ev.gained + " 回响印记（彼岸 Boss/精英掉落）", "energy");
          break;
        case "echoEnter":
          playSfx("unlock");
          setEchoFlash(ev.dimension);
          window.setTimeout(() => setEchoFlash((v) => (v === ev.dimension ? null : v)), 3000);
          break;
        case "talentOverflow":
          pushToast("天赋残辉 +1（溢出天赋点自动转化），全局倍率提升", "energy");
          break;
        case "achievement":
          pushToast(`成就达成：${ev.id}`, "achievement");
          break;
        case "challengeStart":
          pushToast("挑战开启：本局已重置，注意修饰符生效", "info");
          break;
        case "challengeClaim":
          playSfx("unlock");
          const perm = CONFIG.CHALLENGES[ev.id]?.perm;
          pushToast(`挑战通关！永久 ${perm?.label ?? "加成"} 已生效`, "achievement");
          break;
        case "dailyClaim":
          playSfx("upgrade");
          pushToast("每日任务完成，奖励已发放", "info");
          break;
        case "autoBreakdown":
          playSfx("drop");
          pushToast(`自动分解 ${ev.count} 件装备，+${ev.shards} 碎片`, "frag");
          break;
        case "drop": playSfx("drop"); break;
        case "levelUp": playSfx("upgrade"); break;
        default: break;
      }
    });
    cleanupRef.current.push(unsub);

    const off = eng.handleOffline(Date.now());
    if (off) setOffline(off);
    publishGameState(eng.state, true);
    publishDerivedStats(eng.derived);
    setEngine(eng);

    let tickTimer: number | null = null;
    let suspendedAt: number | null = null;

    const stopTicking = () => {
      if (tickTimer !== null) window.clearInterval(tickTimer);
      tickTimer = null;
    };
    const startTicking = () => {
      if (tickTimer !== null || document.hidden) return;
      tickTimer = window.setInterval(() => {
        eng.tick(1 / CONFIG.TICK_RATE);
        publishGameState(eng.state);
      }, 1000 / CONFIG.TICK_RATE);
    };
    startTicking();
    cleanupRef.current.push(stopTicking);

    const derivedIv = window.setInterval(() => {
      if (!document.hidden) publishDerivedStats(eng.derived);
    }, 500);
    cleanupRef.current.push(() => window.clearInterval(derivedIv));

    // Show a world transition only when the published world id actually changes.
    const worldUnsub = gameStore.subscribe(
      (s) => worldForStage(s.combat.stage, s.leap?.purchases?.newWorld ?? 0, s.nexus?.entered ?? false, s.echo?.entered ?? false).id,
      (id, prev) => {
        if (!prev || id === prev) return;
        const def = worldForStage(eng.state.combat.stage, eng.state.leap?.purchases?.newWorld ?? 0, eng.state.nexus?.entered ?? false, eng.state.echo?.entered ?? false);
        setWorldFlash({ name: def.name, color: def.color });
        window.setTimeout(() => setWorldFlash((v) => (v && v.name === def.name ? null : v)), 2600);
      }
    );
    cleanupRef.current.push(worldUnsub);

    const saveIv = window.setInterval(() => {
      if (document.hidden) return;
      eng.state.meta.lastSeenAt = Date.now();
      saveGame(eng.state);
    }, CONFIG.SAVE_INTERVAL_MS);
    cleanupRef.current.push(() => window.clearInterval(saveIv));

    const cloudIv = window.setInterval(() => {
      if (!document.hidden) void uploadSave(eng.state);
    }, 5000);
    cleanupRef.current.push(() => window.clearInterval(cloudIv));

    const lbIv = window.setInterval(() => {
      if (document.hidden) return;
      void (async () => {
        const m = leaderboardMetrics(eng.state);
        await submitScore(eng.state, "stage", m.stage, m.stage);
        await submitScore(eng.state, "mag", m.mag, m.stage);
        await submitScore(eng.state, "prestige", m.prestige, m.stage);
        if (m.season > 0) await submitScore(eng.state, "season", m.season, m.stage);
      })();
    }, 60000);
    cleanupRef.current.push(() => window.clearInterval(lbIv));

    const persistSuspendedState = (upload: boolean) => {
      if (suspendedAt === null) suspendedAt = Date.now();
      eng.state.meta.lastSeenAt = suspendedAt;
      publishGameState(eng.state, true);
      saveGame(eng.state);
      if (upload) void uploadSave(eng.state);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTicking();
        persistSuspendedState(true);
        return;
      }

      const resumed = eng.handleOffline(Date.now());
      suspendedAt = null;
      if (resumed) setOffline(resumed);
      publishGameState(eng.state, true);
      publishDerivedStats(eng.derived);
      startTicking();
    };
    const onPageHide = () => {
      stopTicking();
      persistSuspendedState(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        eng.click();
        publishGameState(eng.state, true);
        publishDerivedStats(eng.derived);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onVisibilityChange);
    window.addEventListener("keydown", onKey);
    cleanupRef.current.push(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onVisibilityChange);
      window.removeEventListener("keydown", onKey);
    });

    if (document.hidden) {
      stopTicking();
      persistSuspendedState(false);
    }
  }, [pushToast, stopEngine]);

  const reload = useCallback((state: GameState) => { void start(state); }, [start]);

  useEffect(() => {
    let listening = true;
    const removeListeners = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
    const unlockAudio = () => {
      void initAudio().then((unlocked) => {
        if (unlocked) removeListeners();
      });
    };
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return removeListeners;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void start();
    return () => {
      mountedRef.current = false;
      stopEngine();
    };
  }, [start, stopEngine]);

  return (
    <Ctx.Provider value={{ engine, toasts, pushToast, unlockCard, milestoneFlash, offline, worldFlash, reload, updateSettings }}>
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
      {leapFlash !== null && (
        <div className="leap-flash">
          <div className="leap-rings"><span /><span /><span /></div>
          <div className="leap-inner">
            <div className="leap-title">世界跃迁</div>
            <div className="leap-sub">跨越世界线 · 新的法则展开</div>
            <div className="leap-cores mono">+{leapFlash} 世界核心</div>
          </div>
        </div>
      )}
      {lawFlash !== null && (
        <div className="law-flash">
          <div className="leap-rings"><span /><span /><span /></div>
          <div className="leap-inner">
            <div className="law-title">法则重写</div>
            <div className="leap-sub">法典重铸 · 公式被改写</div>
            <div className="leap-cores mono">+{lawFlash} 法则碎片</div>
          </div>
        </div>
      )}
      {prestigeFlash !== null && (
        <div className="prestige-flash">
          <div className="leap-rings"><span /><span /><span /></div>
          <div className="leap-inner">
            <div className="prestige-title">宇宙坍缩·重构</div>
            <div className="leap-sub">新的奇点能量展开</div>
            <div className="leap-cores mono">+{prestigeFlash} 能量</div>
          </div>
        </div>
      )}
      {nexusFlash !== null && (
        <div className="nexus-flash">
          <div className="leap-rings"><span /><span /><span /></div>
          <div className="leap-inner">
            <div className="nexus-title">法则彼岸</div>
            <div className="leap-sub">第 4 维度 · 新的法则货币：法则碎片</div>
            <div className="leap-cores">Boss 自动攻击 已激活</div>
          </div>
        </div>
      )}
      {echoFlash !== null && (
        <div className="echo-flash">
          <div className="echo-rings"><span /><span /><span /><span /></div>
          <div className="leap-inner">
            <div className="echo-title">超维回响</div>
            <div className="leap-sub">第 5 维度 · 新的法则货币：回响印记</div>
            <div className="leap-cores">更高维度的法则展开</div>
          </div>
        </div>
      )}
      {worldFlash && (
        <div className="world-flash" style={{ "--world": worldFlash.color } as React.CSSProperties}>
          <div className="world-flash-inner">
            <div className="world-flash-label">进入新世界</div>
            <div className="world-flash-name">{worldFlash.name}</div>
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

function syncReducedMotion(reduceMotion: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
}
