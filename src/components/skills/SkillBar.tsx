"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { SKILL_DEFS, SKILL_IDS, skillCooldown, skillCoreCost } from "@/game/data/skills";
import { toBig } from "@/game/bignum";
import { formatNumber } from "@/game/format";
import type { SkillId } from "@/game/types";

export function SkillBar() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("skills"));
  const actives = useGameSelector((s) => s.skills.actives);
  const cores = useGameSelector((s) => s.skills.cores);
  if (!unlocked) return null;

  const coreNum = toBig(cores).toNumber();
  const activeIds = new Set(actives.map((s) => s.id));
  const locked = SKILL_IDS.filter((id) => !activeIds.has(id));

  return (
    <div className="skill-bar">
      <div className="skill-core-chip" title="技能核心：Boss 掉落，用于升级技能">
        🔷 核心 {formatNumber(coreNum)}
      </div>
      {actives.map((inst) => {
        const def = SKILL_DEFS[inst.id];
        const cd = skillCooldown(def, inst.level);
        const pct = cd > 0 ? Math.min(1, inst.cdRemaining / cd) : 0;
        const ready = inst.cdRemaining <= 0;
        const upCost = skillCoreCost(inst.level);
        return (
          <div
            key={inst.id}
            className={`skill-btn ${ready ? "ready" : ""}`}
            onClick={() => engine?.cast(inst.id as SkillId)}
            title={`${def.name}：${def.desc}（Lv${inst.level}）`}
          >
            <span className="icon">{def.icon}</span>
            <span>{def.name}</span>
            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
              {ready ? `Lv${inst.level} 就绪` : `${inst.cdRemaining.toFixed(0)}s`}
            </span>
            <span
              className={`skill-up ${coreNum >= upCost ? "afford" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                engine?.upgradeSkill(inst.id as SkillId);
              }}
              title={`升级到 Lv${inst.level + 1}（消耗 ${upCost} 核心）`}
            >
              ▲{upCost}
            </span>
            {!ready && <span className="cd-overlay" style={{ height: `${pct * 100}%` }} />}
          </div>
        );
      })}
      {locked.map((id) => {
        const def = SKILL_DEFS[id];
        return (
          <button
            key={id}
            className="skill-btn skill-locked"
            onClick={() => engine?.unlockSkill(id as SkillId)}
            title={`解锁 ${def.name}：${def.desc}`}
          >
            <span className="icon">{def.icon}</span>
            <span>{def.name}</span>
            <span style={{ fontSize: 10, color: "var(--accent)" }}>解锁</span>
          </button>
        );
      })}
    </div>
  );
}