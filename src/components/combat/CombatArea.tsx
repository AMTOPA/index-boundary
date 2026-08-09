"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";
import { worldForStage, BOSS_AFFIX_LABEL, BOSS_AFFIX_ICON } from "@/game/data/worlds";
import { DamageNumbers } from "./DamageNumbers";
import { SkillBar } from "@/components/skills/SkillBar";

const ENEMY_EMOJI: Record<string, string> = {
  data_wastes: "👾",
  mech_city: "🤖",
};

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

  const hp = toBig(enemyHp);
  const maxHp = toBig(enemyMaxHp);
  const pct = maxHp.isZero() ? 0 : Math.min(100, Math.max(0, hp.div(maxHp).toNumber() * 100));
  const world = worldForStage(stage);
  const emoji = isBoss ? "👹" : (ENEMY_EMOJI[world.id] ?? "👾");

  return (
    <div className="panel combat" style={{ ["--world-color" as string]: world.color }}>
      <div className="stage-info">
        <span>
          第 <span className="stage mono">{stage}</span> 关
        </span>
        <span className="mono">连击 {Math.floor(combo)}</span>
        {skipMode && <span style={{ color: "var(--crush)" }}>⚡极速推进</span>}
      </div>
      <div className="dps-line">
        <div>DPS <span className="mono" style={{ color: "var(--accent)" }}>{formatBig(derived.dps)}</span></div>
        <div style={{ fontSize: 11 }}>单次 <span className="mono">{formatBig(derived.damagePerHit)}</span></div>
      </div>
      <div className="enemy-wrap">
        <button
          className={`enemy ${isBoss ? "boss" : ""}`}
          onClick={() => engine?.click()}
          aria-label="点击攻击敌人"
        >
          {emoji}
        </button>
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
                <span key={a} className="affix">{BOSS_AFFIX_ICON[a]} {BOSS_AFFIX_LABEL[a]}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <DamageNumbers />
      <div className="click-hint">
        {autoAttack ? "点击或空格攻击 · 自动攻击进行中" : "点击怪物 / 按空格攻击"}
      </div>
      <SkillBar />
    </div>
  );
}