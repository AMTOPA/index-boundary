"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived, useReducedMotion } from "@/components/common/hooks";
import { toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";
import { worldForStage, WORLDS, BOSS_AFFIX_LABEL, BOSS_AFFIX_ICON, BOSS_AFFIX_DESC, VOID_TARGET_LABEL } from "@/game/data/worlds";
import { CONFIG } from "@/game/config";
import { EnemyCanvas } from "./EnemyCanvas";
import { CombatParticles } from "./CombatParticles";
import { DamageNumbers } from "./DamageNumbers";
import styles from "./CombatVisuals.module.css";

export function CombatArea() {
  const { engine } = useGame();
  const stage = useGameSelector((s) => s.combat.stage);
  const enemyHp = useGameSelector((s) => s.combat.enemyHp);
  const enemyMaxHp = useGameSelector((s) => s.combat.enemyMaxHp);
  const isBoss = useGameSelector((s) => s.combat.isBoss);
  const bossAffixes = useGameSelector((s) => s.combat.bossAffixes);
  const bossTimer = useGameSelector((s) => s.combat.bossTimer);
  const enemyKind = useGameSelector((s) => s.combat.enemyKind);
  const bossShieldHits = useGameSelector((s) => s.combat.bossShieldHits);
  const bossVoidTarget = useGameSelector((s) => s.combat.bossVoidTarget);
  const combo = useGameSelector((s) => s.combat.combo);
  const skipMode = useGameSelector((s) => s.combat.skipMode);
  const autoAttack = useGameSelector((s) => s.meta.unlocks.includes("auto_attack"));
  const newWorldLevel = useGameSelector((s) => s.leap?.purchases?.newWorld ?? 0);
  const nexusEntered = useGameSelector((s) => s.nexus?.entered ?? false);
  const echoEntered = useGameSelector((s) => s.echo?.entered ?? false);
  const derived = useDerived();
  const [shake, setShake] = useState(false);
  const [impact, setImpact] = useState<"crush" | "boss">("crush");
  const shakeTimer = useRef(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!engine) return;
    const unsubscribe = engine.onEvent((ev) => {
      if ((ev.type === "crush" || ev.type === "bossKill" || ev.type === "bossFail") && !reducedMotion) {
        const nextImpact = ev.type === "crush" ? "crush" : "boss";
        setImpact(nextImpact);
        setShake(true);
        window.clearTimeout(shakeTimer.current);
        shakeTimer.current = window.setTimeout(() => {
          setShake(false);
          setImpact("crush");
        }, nextImpact === "boss" ? 560 : 460);
      }
    });
    return () => {
      unsubscribe();
      window.clearTimeout(shakeTimer.current);
    };
  }, [engine, reducedMotion]);

  const hp = toBig(enemyHp);
  const maxHp = toBig(enemyMaxHp);
  const pct = maxHp.isZero() ? 0 : Math.min(100, Math.max(0, hp.div(maxHp).toNumber() * 100));
  const world = worldForStage(stage, newWorldLevel, nexusEntered, echoEntered);
  const worldIndex = WORLDS.findIndex((w) => w.id === world.id);
  const bossPct = isBoss && bossTimer > 0 ? Math.min(100, Math.max(0, (bossTimer / CONFIG.BOSS_TIMER_SEC) * 100)) : 100;
  const shieldMax = CONFIG.BOSS_SHIELD_HITS;
  const shieldLeft = isBoss && bossAffixes.includes("shield") ? bossShieldHits : 0;
  const voidLabel = isBoss && bossVoidTarget ? VOID_TARGET_LABEL[bossVoidTarget] : null;
  const kindLabel = enemyKind === "elite" ? "精英" : enemyKind === "mimic" ? "宝箱怪" : null;

  return (
    <div
      className={`panel combat ${styles.combatSurface} ${shake ? "shake" : ""} ${shake ? `${impact}-impact` : ""} ${isBoss ? "boss-fight" : ""}`}
      style={{ ["--world-color" as string]: world.color }}
    >
      <div className={styles.arenaFrame} aria-hidden="true">
        <span className={styles.arenaSignal}>COMBAT LINK</span>
        <span className={styles.arenaSector}>SECTOR {String(worldIndex + 1).padStart(2, "0")}</span>
      </div>
      <div className="stage-info">
        <span>
          第 <span className="stage mono">{stage}</span> 关
          <span className="world-tag" style={{ color: world.color }}>
            {worldIndex >= 0 && worldIndex < WORLDS.length ? `${worldIndex + 1}.` : ""}{world.name}
          </span>
          {kindLabel && (
            <span className="world-tag" style={{ color: enemyKind === "elite" ? "var(--danger)" : "var(--gold)" }}>
              {enemyKind === "elite" ? "精英" : "宝箱"}
            </span>
          )}
        </span>
        <span className="mono">连击 {Math.floor(combo)}</span>
        {skipMode && <span style={{ color: "var(--crush)" }}>⚡极速推进</span>}
      </div>
      <div className="dps-line">
        <div>DPS <span className="mono" style={{ color: "var(--accent)" }}>{formatBig(derived.dps)}</span></div>
        <div style={{ fontSize: 11 }}>单次 <span className="mono">{formatBig(derived.damagePerHit)}</span></div>
      </div>
      <div className={`enemy-wrap ${styles.enemyWrap}`}>
        <div className={`enemy-stage ${isBoss ? "boss" : ""} ${enemyKind === "elite" ? "elite" : ""} ${enemyKind === "mimic" ? "mimic" : ""}`}>
          {isBoss && <div className="boss-ring" style={{ background: `conic-gradient(var(--danger) ${bossPct}%, rgba(255,255,255,0.08) 0)` }} />}
          <button
            className="enemy"
            onClick={() => engine?.click()}
            aria-label="点击攻击敌人"
            title={isBoss ? "Boss 战：限时 30 秒" : world.enemyStyle}
          >
            <EnemyCanvas worldId={world.id} worldColor={world.color} isBoss={isBoss} affixes={bossAffixes} kind={enemyKind} />
          </button>
          {isBoss && <div className="boss-name">异常核心 · 观测体</div>}
          {enemyKind === "elite" && <div className="boss-name" style={{ color: "var(--danger)" }}>精英 · 强化体</div>}
          {enemyKind === "mimic" && <div className="boss-name" style={{ color: "var(--gold)" }}>宝箱怪</div>}
        </div>
        <div className="hp-bar">
          <div className={`hp-fill ${isBoss ? "boss" : ""}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="hp-text mono">
          {formatBig(hp)} / {formatBig(maxHp)}
        </div>
        {(isBoss || enemyKind === "elite") && (
          <>
            {isBoss && <div className="boss-timer mono">⏱ {Math.max(0, bossTimer).toFixed(1)}s</div>}
            {shieldLeft > 0 && (
              <div className="boss-timer mono" style={{ color: "var(--accent)" }}>
                🛡️ 护盾 {shieldLeft}/{shieldMax}
              </div>
            )}
            {voidLabel && (
              <div className="boss-timer mono" style={{ color: "var(--danger)" }}>
                🌑 虚无：免疫{voidLabel}
              </div>
            )}
            <div className="boss-affixes">
              {bossAffixes.map((a) => (
                <span key={a} className="affix" title={BOSS_AFFIX_DESC[a]}>{BOSS_AFFIX_ICON[a]} {BOSS_AFFIX_LABEL[a]}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <DamageNumbers />
      <CombatParticles />
      <div className="click-hint">
        {autoAttack ? "点击或空格攻击 · 自动攻击进行中" : "点击怪物 / 按空格攻击"}
      </div>
    </div>
  );
}