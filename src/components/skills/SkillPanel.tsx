"use client";
import { useGameSelector } from "@/components/common/hooks";
import { SkillBar } from "./SkillBar";
import { CONFIG } from "@/game/config";

// 技能面板：战斗舱右侧独立面板（主动技能 + 被动技能 + 技能核心）
export function SkillPanel() {
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("skills"));
  return (
    <div className="panel skill-panel">
      <h3>技能</h3>
      {unlocked ? (
        <SkillBar />
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7 }}>
          推进到第 {CONFIG.UNLOCKS.find((u) => u.key === "skills")?.stage ?? 60} 关解锁技能系统：
          Boss 掉落的技能核心可解锁主动技能与升级被动技能。
        </p>
      )}
    </div>
  );
}