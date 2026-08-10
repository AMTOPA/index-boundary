"use client";
import { Fragment, useMemo, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { TALENT_NODES, TALENT_TREES, treePoints } from "@/game/data/talents";
import type { TreeId } from "@/game/types";
import type { TalentNodeDef } from "@/game/data/talents";

const TREE_ICON: Record<TreeId, string> = {
  destruction: "🔥",
  automation: "🤖",
  greed: "💰",
  singularity: "🌌",
};

export function TalentPanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("talents"));
  const points = useGameSelector((s) => s.talents.points);
  const allocations = useGameSelector((s) => s.talents.allocations);
  const keystones = useGameSelector((s) => s.talents.keystones);
  const presets = useGameSelector((s) => s.talents.presets);
  const [confirmTree, setConfirmTree] = useState<TreeId | null>(null);

  const leapUnlocked = useGameSelector((s) => s.meta.unlocks.includes("leap"));
  const trees = useMemo(() => (Object.keys(TALENT_TREES) as TreeId[]).filter((t) => t !== "singularity" || leapUnlocked), [leapUnlocked]);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>天赋</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>到达第 150 关解锁天赋系统。</p>
      </div>
    );
  }

  return (
    <div className="panel talent-panel">
      <div className="panel-title">
        <h3>天赋</h3>
        <span className="points-chip"><span className="pc-icon">⚡</span><span>可用点数</span><span className="mono pc-val">{points}</span></span>
      </div>

      <div className="presets">
        <h3>构筑预设</h3>
        <p className="presets-hint">保存当前天赋方案，随时切换（加载需足够天赋点）。</p>
        {presets.map((p, i) => {
          const letter = ["A", "B", "C"][i];
          const cost = engine ? engine.buildPresetCostOf(i) : 0;
          return (
            <div className="preset-row" key={i}>
              <span className="preset-letter">{letter}</span>
              <div className="preset-info">
                <div className="preset-name">{p.name || `空槽位 ${letter}`}</div>
                <div className="desc">{p.name ? `方案点数 ${cost}` : "尚未保存"}</div>
              </div>
              <div className="preset-actions">
                <button className="mini-btn" onClick={() => engine?.saveBuild(i, `预设${letter}`)}>保存</button>
                <button className="mini-btn" disabled={!p.name || !engine?.canLoadBuild(i)} onClick={() => engine?.loadBuild(i)}>加载</button>
              </div>
            </div>
          );
        })}
      </div>

      {trees.map((tree) => {
        const nodes = TALENT_NODES.filter((n) => n.tree === tree);
        const tiers = [1, 2, 3]
          .map((t) => nodes.filter((n) => n.tier === t))
          .filter((group) => group.length > 0);
        const chosen = keystones[tree];
        const invested = treePoints({ allocations }, tree);
        return (
          <div className="talent-tree" data-tree={tree} key={tree}>
            <div className="talent-tree-head">
              <div className="talent-tree-title">
                <span className="talent-tree-icon">{TREE_ICON[tree]}</span>
                <div>
                  <div className="talent-tree-name">{TALENT_TREES[tree].name}</div>
                  <div className="talent-tree-desc">{TALENT_TREES[tree].desc}</div>
                </div>
              </div>
              <div className="talent-tree-head-right">
                <span className="talent-tree-pts mono">已投入 {invested}</span>
                <button className="mini-btn talent-reset" onClick={() => setConfirmTree(tree)}>重置</button>
              </div>
            </div>
            <div className="talent-flow">
              {tiers.map((tierNodes, ti) => {
                const isKeystoneTier = ti === tiers.length - 1;
                return (
                  <Fragment key={ti}>
                    {ti > 0 && (
                      <div className={`talent-link ${isKeystoneTier ? "branch" : ""}`}>
                        <i className="ln up l1" />
                        <i className="ln up l2" />
                        {isKeystoneTier && (
                          <>
                            <i className="rail" />
                            {tierNodes.map((_, i) => (
                              <i
                                key={i}
                                className="ln down"
                                style={{ left: `${((i + 0.5) / tierNodes.length) * 100}%` }}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    <div className={`talent-tier ${isKeystoneTier ? "keystone-tier" : ""} cols-${tierNodes.length}`}>
                      {tierNodes.map((node) => (
                        <TalentNodeCard
                          key={node.id}
                          node={node}
                          cur={allocations[node.id] ?? 0}
                          can={engine?.canAllocate(node.id) ?? false}
                          chosen={chosen}
                          onAllocate={() => engine?.allocate(node.id)}
                        />
                      ))}
                    </div>
                  </Fragment>
                );
              })}
            </div>
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

function TalentNodeCard({
  node,
  cur,
  can,
  chosen,
  onAllocate,
}: {
  node: TalentNodeDef;
  cur: number;
  can: boolean;
  chosen: string | undefined;
  onAllocate: () => void;
}) {
  const isKeystone = node.type === "keystone";
  const chosenThis = chosen === node.id;
  const maxed = cur >= node.max;
  const cls = [
    "talent-node",
    isKeystone ? "keystone" : "",
    cur > 0 ? "has" : "",
    maxed ? "maxed" : "",
    can ? "can" : "",
    !can && cur === 0 ? "unavail" : "",
    chosenThis ? "chosen" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      style={{ opacity: isKeystone && !chosenThis && chosen ? 0.42 : undefined }}
    >
      <div className="talent-node-head">
        <span className="talent-node-name">{isKeystone ? "✦ " : ""}{node.name}</span>
        {chosenThis ? <span className="talent-node-chosen">已选</span> : null}
      </div>
      <div className="talent-node-desc">{node.desc}</div>
      <div className="talent-node-foot">
        <span className="talent-pts mono">{cur}/{node.max}</span>
        <span className="talent-pips" aria-hidden="true">
          {Array.from({ length: node.max }, (_, i) => (
            <i key={i} className={i < cur ? "on" : ""} />
          ))}
        </span>
        <button className="mini-btn talent-alloc" disabled={!can} onClick={onAllocate}>
          {node.cost} 点
        </button>
      </div>
    </div>
  );
}