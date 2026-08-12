"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import {
  SKILL_DEFS,
  SKILL_IDS,
  skillCooldown,
  skillCoreCost,
  PASSIVE_DEFS,
  PASSIVE_IDS,
  passiveCoreCost,
} from "@/game/data/skills";
import { toBig } from "@/game/bignum";
import { formatNumber } from "@/game/format";
import type { PassiveId, SkillId } from "@/game/types";
import styles from "./SkillBar.module.css";

function activeSkillRevision(state: { skills: { actives: { id: string; level: number; cdRemaining: number; active: boolean }[] } }): string {
  return state.skills.actives
    .map((skill) => `${skill.id}:${skill.level}:${Math.ceil(skill.cdRemaining * 5)}:${skill.active ? 1 : 0}`)
    .join("|");
}

function useActiveSkills() {
  useGameSelector(activeSkillRevision);
  return useGameSelector((state) => state.skills.actives);
}

export function SkillBar() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("skills"));
  const actives = useActiveSkills();
  const cores = useGameSelector((s) => s.skills.cores);
  const passives = useGameSelector((s) => s.skills.passives);
  if (!unlocked) return null;

  const coreCount = toBig(cores).toNumber();
  const activeIds = new Set(actives.map((skill) => skill.id));
  const locked = SKILL_IDS.filter((id) => !activeIds.has(id));

  return (
    <div className={`skill-bar ${styles.bar}`}>
      <div className={`skill-core-chip ${styles.coreChip}`} title="技能核心由 Boss 掉落，用于升级主动与被动技能">
        <span aria-hidden="true">🔷</span>
        <span>技能核心</span>
        <strong>{formatNumber(coreCount)}</strong>
      </div>

      <section className={styles.section} aria-labelledby="active-skills-heading">
        <div className={styles.sectionHeading}>
          <h4 id="active-skills-heading">主动技能</h4>
          <span>释放与升级为独立按钮，避免误操作</span>
        </div>
        <div className={styles.skillGrid}>
          {actives.map((instance) => {
            const definition = SKILL_DEFS[instance.id];
            const cooldown = skillCooldown(definition, instance.level);
            const cooldownRatio = cooldown > 0 ? Math.min(1, instance.cdRemaining / cooldown) : 0;
            const ready = instance.cdRemaining <= 0;
            const upgradeCost = skillCoreCost(instance.level);
            const canUpgrade = coreCount >= upgradeCost;
            const status = instance.active
              ? "生效中"
              : ready
                ? "就绪"
                : `冷却 ${instance.cdRemaining.toFixed(0)} 秒`;

            return (
              <article key={instance.id} className={styles.skillCard}>
                <button
                  type="button"
                  className={`skill-btn ${styles.castButton} ${ready ? "ready" : ""}`}
                  style={ready ? { borderColor: definition.color } : undefined}
                  disabled={!ready || !engine}
                  onClick={() => engine?.cast(instance.id as SkillId)}
                  title={`${definition.name}：${definition.desc}`}
                  aria-label={`释放${definition.name}，等级 ${instance.level}，${status}`}
                >
                  <span className="icon" aria-hidden="true">{definition.icon}</span>
                  <strong>{definition.name}</strong>
                  <span className={styles.status}>{status}</span>
                  {!ready && (
                    <span
                      className={`cd-overlay ${styles.cooldownOverlay}`}
                      style={{ height: `${cooldownRatio * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </button>
                <button
                  type="button"
                  className={`skill-up ${styles.upgradeButton} ${canUpgrade ? "afford" : ""}`}
                  disabled={!canUpgrade || !engine}
                  onClick={() => engine?.upgradeSkill(instance.id as SkillId)}
                  title={`升级到 Lv${instance.level + 1}，消耗 ${upgradeCost} 核心`}
                >
                  <span>升级至 Lv{instance.level + 1}</span>
                  <strong>消耗 {upgradeCost}</strong>
                </button>
              </article>
            );
          })}

          {locked.map((id) => {
            const definition = SKILL_DEFS[id];
            return (
              <button
                key={id}
                type="button"
                className={`skill-btn skill-locked ${styles.lockedCard}`}
                onClick={() => engine?.unlockSkill(id as SkillId)}
                disabled={!engine}
                title={`解锁 ${definition.name}：${definition.desc}`}
              >
                <span className="icon" aria-hidden="true">{definition.icon}</span>
                <strong>{definition.name}</strong>
                <span className={styles.lockedDescription}>{definition.desc}</span>
                <span className={styles.unlockLabel}>免费解锁</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="passive-skills-heading">
        <div className={styles.sectionHeading}>
          <h4 id="passive-skills-heading">被动技能</h4>
          <span>常驻生效</span>
        </div>
        <div className={`passive-bar ${styles.passiveGrid}`}>
          {PASSIVE_IDS.map((id) => {
            const definition = PASSIVE_DEFS[id];
            const level = passives[id] ?? 0;
            const upgradeCost = passiveCoreCost(level);
            const canUpgrade = coreCount >= upgradeCost;

            return (
              <article key={id} className={`passive-btn ${styles.passiveCard}`} title={`${definition.name}：${definition.desc}`}>
                <div className={styles.passiveIdentity}>
                  <span className={`icon ${styles.passiveIcon}`} aria-hidden="true">{definition.icon}</span>
                  <div>
                    <strong>{definition.name}</strong>
                    <span className={styles.passiveLevel}>Lv{level}</span>
                  </div>
                </div>
                <p>{definition.desc}</p>
                <button
                  type="button"
                  className={`skill-up ${styles.upgradeButton} ${canUpgrade ? "afford" : ""}`}
                  disabled={!canUpgrade || !engine}
                  onClick={() => engine?.upgradePassive(id as PassiveId)}
                  title={`升级到 Lv${level + 1}，消耗 ${upgradeCost} 核心`}
                >
                  <span>升级至 Lv{level + 1}</span>
                  <strong>消耗 {upgradeCost}</strong>
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}


export function QuickSkillBar({ onManage, embedded = false }: { onManage: () => void; embedded?: boolean }) {
  const { engine } = useGame();
  const unlocked = useGameSelector((state) => state.meta.unlocks.includes("skills"));
  const actives = useActiveSkills();

  if (!unlocked) {
    return (
      <section className={`${styles.quickPanel} ${embedded ? styles.embedded : ""}`.trim()} aria-label="未解锁技能快捷栏">
        <div className={styles.quickLocked}>
          <span aria-hidden="true">🔒</span>
          <strong>技能冷却中</strong>
          <small>推进关卡后解锁新的指挥模块</small>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.quickPanel} ${embedded ? styles.embedded : ""}`.trim()} aria-labelledby="quick-skills-heading">
      <div className={styles.quickHeading}>
        <div>
          <span className={styles.quickKicker}>TACTICAL SKILLS</span>
          <h3 id="quick-skills-heading">主动技能</h3>
        </div>
        <button type="button" className="mini-btn" onClick={onManage}>管理</button>
      </div>
      <div className={styles.quickGrid}>
        {actives.map((instance) => {
          const definition = SKILL_DEFS[instance.id];
          const cooldown = skillCooldown(definition, instance.level);
          const cooldownRatio = cooldown > 0 ? Math.min(1, instance.cdRemaining / cooldown) : 0;
          const ready = instance.cdRemaining <= 0;
          const status = instance.active ? "生效中" : ready ? "就绪" : `${Math.ceil(instance.cdRemaining)}s`;

          return (
            <button
              key={instance.id}
              type="button"
              className={`skill-btn ${styles.quickSkill} ${ready ? "ready" : ""}`}
              style={ready ? { borderColor: definition.color } : undefined}
              disabled={!ready || !engine}
              onClick={() => engine?.cast(instance.id as SkillId)}
              aria-label={`释放${definition.name}，${status}`}
              title={`${definition.name}：${definition.desc}`}
            >
              <span className={styles.quickIcon} aria-hidden="true">{definition.icon}</span>
              <span className={styles.quickCopy}>
                <strong>{definition.name}</strong>
                <small>{status}</small>
              </span>
              {!ready && (
                <span
                  className={`cd-overlay ${styles.cooldownOverlay}`}
                  style={{ height: `${cooldownRatio * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
