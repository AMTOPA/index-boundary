"use client";
import { useGameSelector } from "@/components/common/hooks";
import { ACHIEVEMENTS } from "@/game/data/achievements";

export function AchievementPanel() {
  const unlockedList = useGameSelector((s) => s.meta.achievements);
  const unlockedSet = new Set(unlockedList);
  const done = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;

  return (
    <div className="panel">
      <div className="panel-title">
        <h3>成就</h3>
        <span className="hint">{done}/{ACHIEVEMENTS.length}</span>
      </div>
      {ACHIEVEMENTS.map((a) => {
        const got = unlockedSet.has(a.id);
        return (
          <div className="upgrade-row" key={a.id} style={{ opacity: got ? 1 : 0.5 }}>
            <div>
              <div>{got ? "🏆" : "🔒"} {a.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{a.desc}</div>
            </div>
            {got && <span style={{ color: "var(--green)", fontSize: 16 }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}