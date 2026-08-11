"use client";
import { useGameSelector } from "@/components/common/hooks";
import { SkillBar } from "./SkillBar";
import { CONFIG } from "@/game/config";
import styles from "./SkillPanel.module.css";

export function SkillPanel() {
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("skills"));
  const unlockStage = CONFIG.UNLOCKS.find((unlock) => unlock.key === "skills")?.stage ?? 60;

  return (
    <section className="panel skill-panel" aria-labelledby="skill-panel-heading">
      <h3 id="skill-panel-heading">技能</h3>
      {unlocked ? (
        <SkillBar />
      ) : (
        <p className={styles.lockedDescription}>
          推进到第 {unlockStage} 关解锁技能系统。Boss 掉落的技能核心可解锁主动技能与升级被动技能。
        </p>
      )}
    </section>
  );
}
