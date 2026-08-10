"use client";
import { useMemo, useState } from "react";
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

type AchFilter = "all" | "done" | "locked";

export function AchievementPanel() {
  const { engine } = useGame();
  const unlockedList = useGameSelector((s) => s.meta.achievements);
  const unlockedSet = useMemo(() => new Set(unlockedList), [unlockedList]);
  const daily = useGameSelector((s) => s.daily);
  const [filter, setFilter] = useState<AchFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const done = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;
  const locked = ACHIEVEMENTS.filter((a) => !unlockedSet.has(a.id));

  const visible = useMemo(() => {
    const base = filter === "done" ? ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id))
      : filter === "locked" ? locked
      : ACHIEVEMENTS;
    // 未展开时：全部达成 + 前 6 个未达成
    if (expanded || filter !== "all") return base;
    const doneList = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id));
    return [...doneList, ...locked.slice(0, 6)];
  }, [filter, expanded, locked, unlockedSet]);

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
      <div className="ach-filters">
        {([["all", "全部"], ["done", "已达成"], ["locked", "未达成"]] as [AchFilter, string][]).map(([f, label]) => (
          <button key={f} className={`mini-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
        {filter === "all" && !expanded && (
          <button className="mini-btn" onClick={() => setExpanded(true)}>展开全部（{ACHIEVEMENTS.length - 6 - done > 0 ? ACHIEVEMENTS.length - 6 - done : 0} 隐藏）</button>
        )}
        {filter === "all" && expanded && (
          <button className="mini-btn" onClick={() => setExpanded(false)}>收起</button>
        )}
      </div>
      <div className="ach-grid">
        {visible.map((a) => {
          const got = unlockedSet.has(a.id);
          return (
            <div key={a.id} className={`ach-card ${got ? "done" : "locked"}`} title={a.desc}>
              <span className="ach-icon">{got ? "🏆" : "🔒"}</span>
              <span className="ach-info">
                <span className="ach-name">{a.name}</span>
                <span className="ach-desc">{a.desc}</span>
              </span>
            </div>
          );
        })}
        {visible.length === 0 && <p style={{ fontSize: 12, color: "var(--text-dim)" }}>无成就</p>}
      </div>
    </div>
  );
}