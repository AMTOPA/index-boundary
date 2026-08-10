"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber, formatBigPrecise } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { LeapUpgradeId } from "@/game/types";
import { leapShopCostFrom, leapCores, leapAllStatsMult } from "@/game/systems/leap";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const SHOP_ORDER: LeapUpgradeId[] = ["lawExponent", "startStage", "allStats", "newWorld", "autoLeap"];

export function LeapPanel() {
  const { engine } = useGame();
  const state = useGameSelector((s) => s);
  const unlocked = state.meta.unlocks.includes("leap");
  const [confirm, setConfirm] = useState(false);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>世界跃迁（第二层）</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
          推进到第 {CONFIG.LEAP.STAGE} 关解锁世界跃迁。跃迁 = 跨世界线：重置升级/装备/技能/天赋/重构，保留成就、统计与世界核心。
        </p>
      </div>
    );
  }

  const { cores, purchases, totalLeaps, totalCoresEarned } = state.leap;
  const canLeap = engine?.canLeap() ?? false;
  const previewCores = leapCores(state);
  const allStatsLv = purchases.allStats ?? 0;
  const allStatsMult = leapAllStatsMult(allStatsLv);
  const lawLv = purchases.lawExponent ?? 0;
  const hpGrowth = Math.max(1.05, CONFIG.HP_GROWTH - lawLv * CONFIG.LEAP.SHOP.lawExponent.perLevel);

  return (
    <div className="panel">
      <h3>世界跃迁（第二层重置）</h3>
      <div className="prestige-info">
        <div>世界核心：<span className="mono" style={{ color: "var(--super)" }}>{formatNumber(cores)}</span>（累计 {formatNumber(totalCoresEarned)}）</div>
        <div>跃迁次数：<span className="mono">{totalLeaps}</span></div>
        {allStatsLv > 0 && <div>全属性全局倍率：<span className="mono">×{formatBigPrecise(allStatsMult)}</span>（每 3 级 ×2）</div>}
        {lawLv > 0 && <div>法则指数：怪物 HP 成长 <span className="mono">{CONFIG.HP_GROWTH} → {hpGrowth.toFixed(3)}</span></div>}
        {canLeap && (
          <div style={{ marginTop: 4, color: "var(--green)" }}>
            跃迁可获得 <span className="mono">+{previewCores}</span> 世界核心
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          跃迁将重置：关卡、金币、升级、装备、技能、天赋、重构（保留：成就、统计、世界核心与已购升级）。
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className={`btn primary ${canLeap ? "leap-ready" : ""}`} disabled={!canLeap} onClick={() => setConfirm(true)}>
          跨越世界线（跃迁）
        </button>
      </div>

      <h3 style={{ marginTop: 14 }}>世界核心商店</h3>
      <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>价格 1/2/3/5/8/13… 斐波那契递增；世界核心不直接改“指数上的指数”，只做有界公式微调 + 解锁 + 倍率。</p>
      {SHOP_ORDER.map((id) => {
        const def = CONFIG.LEAP.SHOP[id];
        const cur = purchases[id] ?? 0;
        const cost = leapShopCostFrom(cur, id);
        const maxed = cur >= def.max;
        const affordable = cores >= cost;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.label} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{cur}/{def.max}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            <button className="mini-btn" disabled={maxed || !affordable} onClick={() => engine?.buyLeapUpgrade(id)}>
              {maxed ? "已满" : `${cost} 核心`}
            </button>
          </div>
        );
      })}

      {confirm && (
        <ConfirmModal
          title="确认跨越世界线？"
          onCancel={() => setConfirm(false)}
          onConfirm={() => { engine?.leap(); setConfirm(false); }}
          confirmText="确认跃迁"
          danger
        >
          <p style={{ fontSize: 13, lineHeight: 1.7 }}>
            将获得 <span className="mono" style={{ color: "var(--super)" }}>{previewCores}</span> 世界核心。
            <br />
            本世界线的升级、装备、技能、天赋、重构将被完全重置，保留成就/统计与已购世界核心升级。
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
