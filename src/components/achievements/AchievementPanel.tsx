"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ACHIEVEMENTS } from "@/game/data/achievements";
import { CONFIG } from "@/game/config";
import { formatNumber } from "@/game/format";
import type { DailyQuest } from "@/game/types";

function questLabel(q: DailyQuest): string {
  const def = CONFIG.DAILY.POOL.find((d) => d.id === q.id);
  const t = q.type === "gold" ? `1e${q.target}` : formatNumber(q.target);
  return def ? `${def.label} ${t}` : `${q.type} ${t}`;
}

function questProgressText(q: DailyQuest): string {
  if (q.type === "gold") return `1e${q.progress}`;
  return formatNumber(q.progress);
}

export function AchievementPanel() {
  const { engine } = useGame();
  const unlockedList = useGameSelector((s) => s.meta.achievements);
  const unlockedSet = new Set(unlockedList);
  const done = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;
  const daily = useGameSelector((s) => s.daily);

  return (
    <div className="panel">
      <div className="panel-title">
        <h3>每日任务</h3>
        <span className="hint">{daily.date || "今日"}</span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>每日刷新，仅在线推进；完成领取技能核心。</p>
      {daily.quests.map((q, i) => {
        const done = q.progress >= q.target;
        const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100));
        return (
          <div className="upgrade-row" key={i}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{questLabel(q)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div className="progress-bar" style={{ flex: 1, height: 6 }}>
                  <div style={{ width: `${pct}%`, height: "100%" }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{questProgressText(q)}/{q.type === "gold" ? `1e${q.target}` : formatNumber(q.target)}</span>
              </div>
            </div>
            {q.claimed ? (
              <span style={{ color: "var(--green)", fontSize: 16 }}>✓</span>
            ) : (
              <button className="mini-btn" disabled={!done} onClick={() => engine?.claimDailyQuest(i)}>领取</button>
            )}
          </div>
        );
      })}
      {daily.quests.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)" }}>今日无任务（离线不结算每日进度）。</p>
      )}

      <div className="panel-title" style={{ marginTop: 14 }}>
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