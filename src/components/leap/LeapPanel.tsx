"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber, formatBigPrecise } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { LeapUpgradeId } from "@/game/types";
import { leapShopCostFrom, leapCoresForStage, leapAllStatsMult, hasLeapCoreBonusAtStage } from "@/game/systems/leap";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const SHOP_ORDER: LeapUpgradeId[] = ["lawExponent", "startStage", "allStats", "newWorld", "autoLeap"];

export function LeapPanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("leap"));
  const stage = useGameSelector((s) => s.combat.stage);
  const cores = useGameSelector((s) => s.leap.cores);
  const totalLeaps = useGameSelector((s) => s.leap.totalLeaps);
  const totalCoresEarned = useGameSelector((s) => s.leap.totalCoresEarned);
  const lawLv = useGameSelector((s) => s.leap.purchases.lawExponent ?? 0);
  const startStageLv = useGameSelector((s) => s.leap.purchases.startStage ?? 0);
  const allStatsLv = useGameSelector((s) => s.leap.purchases.allStats ?? 0);
  const newWorldLv = useGameSelector((s) => s.leap.purchases.newWorld ?? 0);
  const autoLeapLv = useGameSelector((s) => s.leap.purchases.autoLeap ?? 0);
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

  const purchaseLevels: Record<LeapUpgradeId, number> = {
    lawExponent: lawLv,
    startStage: startStageLv,
    allStats: allStatsLv,
    newWorld: newWorldLv,
    autoLeap: autoLeapLv,
  };
  const canLeap = engine?.canLeap() ?? false;
  const previewCores = leapCoresForStage(stage);
  const allStatsMult = leapAllStatsMult(allStatsLv);
  const hasCoreBonus = hasLeapCoreBonusAtStage(stage);
  const hpGrowth = Math.max(1.05, CONFIG.HP_GROWTH - lawLv * CONFIG.LEAP.SHOP.lawExponent.perLevel);

  return (
    <div className="panel leap-panel">
      <div className="panel-title leap-panel-title">
        <div>
          <span className="command-kicker">WORLDLINE COMMAND</span>
          <h3>世界跃迁</h3>
        </div>
        <span className="leap-core-badge">🔮 <span className="mono">{formatNumber(cores)}</span> 世界核心</span>
      </div>
      <div className="leap-panel-grid">
        <section className="leap-status-card">
          <div className="leap-section-label">跃迁预览 · 第二层重置</div>
          <div className="prestige-info">
        <div>世界核心：<span className="mono" style={{ color: "var(--super)" }}>{formatNumber(cores)}</span>（累计 {formatNumber(totalCoresEarned)}）</div>
        <div>跃迁次数：<span className="mono">{totalLeaps}</span></div>
        <div>世界核心升级「全属性」<span className="mono">Lv{allStatsLv}</span>：全局伤害与金币 <span className="mono">×{formatBigPrecise(allStatsMult)}</span>（每级 ×{CONFIG.LEAP.SHOP.allStats.perLevel}，乘算叠加）</div>
        {lawLv > 0 && <div>法则指数：怪物 HP 成长 <span className="mono">{CONFIG.HP_GROWTH} → {hpGrowth.toFixed(3)}</span></div>}
        {canLeap && (
          <div style={{ marginTop: 4, color: "var(--green)" }}>
            跃迁可获得 <span className="mono">+{previewCores}</span> 世界核心
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
          计算方式：基础 <span className="mono">+{CONFIG.LEAP.CORE_PER_LEAP}</span>
          {hasCoreBonus ? (
            <span>；本次世界线已到第 {formatNumber(stage)} 关，超过 {formatNumber(CONFIG.LEAP.CORE_BONUS_STAGE)} 关 → 额外 <span className="mono" style={{ color: "var(--green)" }}>+1</span></span>
          ) : (
            <span>；本次世界线需超过 {formatNumber(CONFIG.LEAP.CORE_BONUS_STAGE)} 关才能额外 +1（当前 {formatNumber(stage)}，至少到达 {formatNumber(CONFIG.LEAP.CORE_BONUS_STAGE + 1)} 关）</span>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          跃迁将重置：关卡、金币、升级、装备、技能、天赋、重构（保留：成就、统计、世界核心与已购升级）。
        </div>
          </div>
          <button className={`btn primary leap-action ${canLeap ? "leap-ready" : ""}`} disabled={!canLeap} onClick={() => setConfirm(true)}>
            跨越世界线（跃迁）
          </button>
        </section>

        <section className="leap-shop-card">
          <div className="leap-section-label">世界核心商店</div>
          <p className="leap-shop-hint">价格 1/2/3/5/8/13… 斐波那契递增；升级均为永久效果。</p>
          {SHOP_ORDER.map((id) => {
        const def = CONFIG.LEAP.SHOP[id];
        const cur = purchaseLevels[id];
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
        </section>
      </div>

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
