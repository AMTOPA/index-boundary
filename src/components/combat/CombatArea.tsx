"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";
import { worldForStage, WORLDS, BOSS_AFFIX_LABEL, BOSS_AFFIX_ICON, BOSS_AFFIX_DESC } from "@/game/data/worlds";
import { CONFIG } from "@/game/config";
import { EnemyCanvas } from "./EnemyCanvas";
import { CombatParticles } from "./CombatParticles";
import { DamageNumbers } from "./DamageNumbers";
import { SkillBar } from "@/components/skills/SkillBar";

export function CombatArea() {
  const { engine } = useGame();
  const stage = useGameSelector((s) => s.combat.stage);
  const enemyHp = useGameSelector((s) => s.combat.enemyHp);
  const enemyMaxHp = useGameSelector((s) => s.combat.enemyMaxHp);
  const isBoss = useGameSelector((s) => s.combat.isBoss);
  const bossAffixes = useGameSelector((s) => s.combat.bossAffixes);
  const bossTimer = useGameSelector((s) => s.combat.bossTimer);
  const combo = useGameSelector((s) => s.combat.combo);
  const skipMode = useGameSelector((s) => s.combat.skipMode);
  const autoAttack = useGameSelector((s) => s.meta.unlocks.includes("auto_attack"));
  const derived = useDerived();
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef(0);

  useEffect(() => {
    if (!engine) return;
    return engine.onEvent((ev) => {
      if (ev.type === "crush" || ev.type === "bossKill" || ev.type === "bossFail") {
        setShake(true);
        window.clearTimeout(shakeTimer.current);
        shakeTimer.current = window.setTimeout(() => setShake(false), 360);
      }
    });
  }, [engine]);

  const hp = toBig(enemyHp);
  const maxHp = toBig(enemyMaxHp);
  const pct = maxHp.isZero() ? 0 : Math.min(100, Math.max(0, hp.div(maxHp).toNumber() * 100));
  const world = worldForStage(stage);
  const worldIndex = WORLDS.findIndex((w) => w.id === world.id);
  const bossPct = isBoss && bossTimer > 0 ? Math.min(100, Math.max(0, (bossTimer / CONFIG.BOSS_TIMER_SEC) * 100)) : 100;

  return (
    <div
      className={`panel combat ${shake ? "shake" : ""}`}
      style={{ ["--world-color" as string]: world.color }}
    >
      <div className="stage-info">
        <span>
          第 <span className="stage mono">{stage}</span> 关
          <span className="world-tag" style={{ color: world.color }}>
            {worldIndex >= 0 && worldIndex < WORLDS.length ? `${worldIndex + 1}.` : ""}{world.name}
          </span>
        </span>
        <span className="mono">连击 {Math.floor(combo)}</span>
        {skipMode && <span style={{ color: "var(--crush)" }}>⚡极速推进</span>}
      </div>
      <div className="dps-line">
        <div>DPS <span className="mono" style={{ color: "var(--accent)" }}>{formatBig(derived.dps)}</span></div>
        <div style={{ fontSize: 11 }}>单次 <span className="mono">{formatBig(derived.damagePerHit)}</span></div>
      </div>
      <div className="enemy-wrap">
        <div className={`enemy-stage ${isBoss ? "boss" : ""}`}>
          {isBoss && <div className="boss-ring" style={{ background: `conic-gradient(var(--danger) ${bossPct}%, rgba(255,255,255,0.08) 0)` }} />}
          <button
            className="enemy"
            onClick={() => engine?.click()}
            aria-label="点击攻击敌人"
            title={isBoss ? "Boss 战：限时 30 秒" : world.enemyStyle}
          >
            <EnemyCanvas worldId={world.id} worldColor={world.color} isBoss={isBoss} affixes={bossAffixes} />
          </button>
          {isBoss && <div className="boss-name">异常核心 · 观测体</div>}
        </div>
        <div className="hp-bar">
          <div className={`hp-fill ${isBoss ? "boss" : ""}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="hp-text mono">
          {formatBig(hp)} / {formatBig(maxHp)}
        </div>
        {isBoss && (
          <>
            <div className="boss-timer mono">⏱ {Math.max(0, bossTimer).toFixed(1)}s</div>
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
      <SkillBar />
    </div>
  );
}