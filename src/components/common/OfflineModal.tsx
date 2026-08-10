"use client";
import type { OfflineResult } from "@/game/engine";
import { formatBig } from "@/game/format";
import { formatDuration } from "@/game/format";

export function OfflineModal({ result, onClose }: { result: OfflineResult; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>离线收益</h2>
        <div className="stat-grid">
          <div className="stat-item"><div className="k">离线时长</div><div className="v">{formatDuration(result.seconds)}</div></div>
          <div className="stat-item"><div className="k">获得金币</div><div className="v mono" style={{ color: "var(--gold)" }}>{formatBig(result.goldGained)}</div></div>
          <div className="stat-item"><div className="k">击杀</div><div className="v">{result.kills}</div></div>
          <div className="stat-item"><div className="k">推进关卡</div><div className="v">+{result.stagesAdvanced}</div></div>
          <div className="stat-item"><div className="k">装备掉落</div><div className="v">{result.drops}</div></div>
        </div>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button className="btn primary" onClick={onClose}>收下</button>
        </div>
      </div>
    </div>
  );
}