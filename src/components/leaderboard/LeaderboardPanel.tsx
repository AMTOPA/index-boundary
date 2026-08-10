"use client";
import { useEffect, useState } from "react";
import { apiLeaderboard, type LeaderboardData, type ScoreKind } from "@/lib/api";
import { formatNumber } from "@/game/format";

const KINDS: { id: ScoreKind; label: string }[] = [
  { id: "stage", label: "最大关卡" },
  { id: "mag", label: "总伤数量级" },
  { id: "prestige", label: "重构次数" },
  { id: "season", label: "试炼赛季分" },
];

export function LeaderboardPanel() {
  const [kind, setKind] = useState<ScoreKind>("stage");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiLeaderboard(50, kind)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind]);

  return (
    <div className="panel">
      <h3>排行榜</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {KINDS.map((k) => (
          <button key={k.id} className={`mini-btn ${kind === k.id ? "buy-btn afford" : ""}`} onClick={() => setKind(k.id)}>{k.label}</button>
        ))}
      </div>
      {loading && <p style={{ fontSize: 12, color: "var(--text-dim)" }}>加载中…</p>}
      {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}
      {data && (
        <>
          {data.me && (
            <div className="lb-row me">
              <span className="lb-rank">我</span>
              <span className="lb-name">{data.me.username}</span>
              <span className="lb-val">{formatNumber(data.me.best)}</span>
              <span className="lb-rank">{data.me.runs} 次</span>
            </div>
          )}
          {data.list.map((row) => (
            <div className="lb-row" key={`${row.rank}_${row.username}`}>
              <span className="lb-rank">#{row.rank}</span>
              <span className="lb-name">{row.username}</span>
              <span className="lb-val">{formatNumber(row.best)}</span>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>最深 {formatNumber(row.best_depth)} 关</span>
            </div>
          ))}
          {data.list.length === 0 && <p style={{ fontSize: 12, color: "var(--text-dim)" }}>暂无数据，快去冲榜吧！</p>}
        </>
      )}
    </div>
  );
}