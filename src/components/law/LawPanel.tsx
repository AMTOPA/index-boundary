"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { LawId } from "@/game/types";
import { lawShards, lawShopCostFrom } from "@/game/systems/law";

const SHOP_ORDER: LawId[] = ["critExp", "goldExp", "apsCap", "goldToDmg"];

export function LawPanel() {
  const { engine } = useGame();
  const state = useGameSelector((s) => s);
  const unlocked = state.meta.unlocks.includes("lawRewrite");
  const [confirm, setConfirm] = useState(false);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>法则重写（第三层）</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
          推进到第 {CONFIG.LAWS.REWRITE_STAGE} 关解锁法则重写。重写将重置跃迁升级以下的一切，获得法则碎片，用碎片改写公式系数/指数（全部有硬上限）。
        </p>
      </div>
    );
  }

  const { shards, purchases, totalRewrites } = state.laws;
  const canRewrite = engine?.canRewriteLaw() ?? false;
  const preview = lawShards(state);

  return (
    <div className="panel">
      <h3>法则重写（第三层重置）</h3>
      <div className="prestige-info">
        <div>法则碎片：<span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span>（累计 {formatNumber(state.laws.totalShardsEarned)}）</div>
        <div>重写次数：<span className="mono">{totalRewrites}</span></div>
        {canRewrite && (
          <div style={{ marginTop: 4, color: "var(--green)" }}>
            重写可获得 <span className="mono">+{preview}</span> 法则碎片
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          重写将重置：关卡、金币、升级、装备、技能、天赋、重构，以及世界核心已购升级（保留未花费核心、成就、统计与法则碎片）。
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className={`btn primary ${canRewrite ? "law-ready" : ""}`} disabled={!canRewrite} onClick={() => setConfirm(true)}>
          重写法典（法则重写）
        </button>
      </div>

      <h3 style={{ marginTop: 14 }}>法则补丁（硬上限）</h3>
      {SHOP_ORDER.map((id) => {
        const def = CONFIG.LAWS.PATCHES[id];
        const cur = purchases[id] ?? 0;
        const cost = lawShopCostFrom(cur, id);
        const maxed = cur >= def.max;
        const affordable = shards >= cost;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.label} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{cur}/{def.max}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            <button className="mini-btn" disabled={maxed || !affordable} onClick={() => engine?.buyLawPatch(id)}>
              {maxed ? "已满" : `${cost} 碎片`}
            </button>
          </div>
        );
      })}

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>确认重写法典？</h2>
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              将获得 <span className="mono" style={{ color: "var(--gold)" }}>{preview}</span> 法则碎片。
              <br />
              第三层以下（含世界核心已购升级）将被重置；法则补丁、成就与统计保留。
            </p>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setConfirm(false)}>取消</button>
              <button className="btn danger" onClick={() => { engine?.rewriteLaw(); setConfirm(false); }}>确认重写</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
