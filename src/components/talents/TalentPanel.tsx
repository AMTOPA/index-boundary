"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { TALENT_NODES, TALENT_TREES, talentNodeById } from "@/game/data/talents";
import type { TreeId } from "@/game/types";

export function TalentPanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("talents"));
  const points = useGameSelector((s) => s.talents.points);
  const allocations = useGameSelector((s) => s.talents.allocations);
  const keystones = useGameSelector((s) => s.talents.keystones);
  const [confirmTree, setConfirmTree] = useState<TreeId | null>(null);

  const trees = useMemo(() => Object.keys(TALENT_TREES) as TreeId[], []);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>天赋</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>到达第 150 关解锁天赋系统。</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h3>天赋</h3>
        <span className="hint">可用点数 <span className="mono" style={{ color: "var(--green)" }}>{points}</span></span>
      </div>
      {trees.map((tree) => {
        const nodes = TALENT_NODES.filter((n) => n.tree === tree).sort((a, b) => a.tier - b.tier);
        const chosen = keystones[tree];
        return (
          <div className="talent-tree" key={tree}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong>{TALENT_TREES[tree].name} · {TALENT_TREES[tree].desc}</strong>
              <button className="mini-btn" onClick={() => setConfirmTree(tree)}>重置</button>
            </div>
            {nodes.map((node) => {
              const cur = allocations[node.id] ?? 0;
              const def = talentNodeById(node.id)!;
              const can = engine?.canAllocate(node.id) ?? false;
              const isKeystone = node.type === "keystone";
              const chosenThis = chosen === node.id;
              const cls = [
                "talent-node",
                isKeystone ? "keystone" : "",
                can ? "can" : "",
                cur >= node.max && !chosenThis ? "locked" : "",
              ].join(" ");
              return (
                <div className={cls} key={node.id} style={{ opacity: isKeystone && !chosenThis && chosen ? 0.4 : undefined }}>
                  <div>
                    <div>{isKeystone ? "✦ " : ""}{node.name} {chosenThis ? "✓" : ""}</div>
                    <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{node.desc}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="pts">{cur}/{node.max}</span>
                    <button className="mini-btn" disabled={!can} onClick={() => engine?.allocate(node.id)}>
                      {node.cost}点
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {confirmTree && (
        <div className="modal-backdrop" onClick={() => setConfirmTree(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>重置「{TALENT_TREES[confirmTree].name}」树？</h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>将返还全部已投入天赋点。</p>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setConfirmTree(null)}>取消</button>
              <button className="btn danger" onClick={() => { engine?.resetTree(confirmTree); setConfirmTree(null); }}>确认重置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}