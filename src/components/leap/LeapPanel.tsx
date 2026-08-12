"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber, formatBigPrecise } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { LeapUpgradeId } from "@/game/types";
import { leapShopCostFrom, leapCoresForStage, leapAllStatsMult } from "@/game/systems/leap";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const SHOP_ORDER: LeapUpgradeId[] = ["lawExponent", "startStage", "allStats", "newWorld", "autoLeap"];

export function LeapPanel() {
  const { engine, updateAutoLeapRule } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("leap") || s.meta.discoveries.includes("leap"));
  const stage = useGameSelector((s) => s.combat.stage);
  const cores = useGameSelector((s) => s.leap.cores);
  const totalLeaps = useGameSelector((s) => s.leap.totalLeaps);
  const totalCoresEarned = useGameSelector((s) => s.leap.totalCoresEarned);
  const lawLv = useGameSelector((s) => s.leap.purchases.lawExponent ?? 0);
  const startStageLv = useGameSelector((s) => s.leap.purchases.startStage ?? 0);
  const allStatsLv = useGameSelector((s) => s.leap.purchases.allStats ?? 0);
  const newWorldLv = useGameSelector((s) => s.leap.purchases.newWorld ?? 0);
  const autoLeapLv = useGameSelector((s) => s.leap.purchases.autoLeap ?? 0);
  const autoRule = useGameSelector((s) => s.leap.autoRule);
  const [confirm, setConfirm] = useState(false);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>世界跃迁（第二层）</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
          首次推进到第 {CONFIG.LEAP.STAGE} 关解锁世界跃迁。跃迁会重置升级/装备/技能/天赋/重构及其门槛，保留成就、统计与世界核心。
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
  const requiredStage = engine?.leapRequiredStage() ?? CONFIG.LEAP.STAGE;
  const nextRequiredStage = Math.min(CONFIG.LEAP.MAX_STAGE_REQUIREMENT, requiredStage + CONFIG.LEAP.STAGE_PER_LEAP);
  const previewCores = leapCoresForStage(stage);
  const bonusCores = previewCores - CONFIG.LEAP.CORE_PER_LEAP;
  const nextBonusStage = bonusCores === 0
    ? CONFIG.LEAP.CORE_BONUS_STAGE
    : CONFIG.LEAP.CORE_BONUS_STAGE + bonusCores * CONFIG.LEAP.CORE_BONUS_STEP;
  const allStatsMult = leapAllStatsMult(allStatsLv);
  const hpGrowth = Math.max(1.05, CONFIG.HP_GROWTH - lawLv * CONFIG.LEAP.SHOP.lawExponent.perLevel);
  const advancedAutoLeap = autoLeapLv > 0 && totalLeaps >= 3;
  const autoRuleStatus = engine?.autoLeapRuleStatus() ?? {
    stage: stage >= autoRule.minStage,
    cores: previewCores >= autoRule.minCores,
    leaps: totalLeaps >= autoRule.minTotalLeaps,
    previewCores,
  };

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
        <div>
          本次门槛：<span className="mono" style={{ color: stage >= requiredStage ? "var(--green)" : "var(--danger)" }}>{formatNumber(stage)} / {formatNumber(requiredStage)} 关</span>
          {requiredStage < CONFIG.LEAP.MAX_STAGE_REQUIREMENT && <span style={{ color: "var(--text-dim)" }}>（成功后提升至 {formatNumber(nextRequiredStage)} 关）</span>}
        </div>
        {canLeap && (
          <div style={{ marginTop: 4, color: "var(--green)" }}>
            跃迁可获得 <span className="mono">+{previewCores}</span> 世界核心
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
          奖励规则：基础 <span className="mono">+{CONFIG.LEAP.CORE_PER_LEAP}</span>；达到 <span className="mono">{formatNumber(CONFIG.LEAP.CORE_BONUS_STAGE)}</span> 关后额外 +1，之后每推进 <span className="mono">{formatNumber(CONFIG.LEAP.CORE_BONUS_STEP)}</span> 关再 +1，无上限。
          <br />当前额外 <span className="mono" style={{ color: bonusCores > 0 ? "var(--green)" : "inherit" }}>+{bonusCores}</span>；到第 <span className="mono">{formatNumber(nextBonusStage)}</span> 关时奖励提升为 +{previewCores + 1} 核心。
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          跃迁将重置：关卡、金币、升级、装备、技能、天赋、重构及重构门槛（回到 500 关）；保留成就、统计、世界核心与已购升级。
        </div>
          </div>
          <button className={`btn primary leap-action ${canLeap ? "leap-ready" : ""}`} disabled={!canLeap} onClick={() => setConfirm(true)}>
            {canLeap ? "跨越世界线（跃迁）" : `还需到达第 ${formatNumber(requiredStage)} 关`}
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

        <section className="auto-leap-card">
          <div className="leap-section-label">高级自动跃迁策略</div>
          {autoLeapLv <= 0 ? (
            <p className="auto-leap-locked">先在世界核心商店购买「自动跃迁」。基础版会在达到硬门槛并确认卡墙后执行。</p>
          ) : !advancedAutoLeap ? (
            <div className="auto-leap-locked">
              <strong>基础自动跃迁已启用</strong>
              <span>累计跃迁达到 3 次后解锁策略阈值；当前 {totalLeaps} / 3 次。</span>
            </div>
          ) : (
            <>
              <div className="auto-leap-summary">
                <div><span>当前关卡</span><strong className={autoRuleStatus.stage ? "is-met" : ""}>{formatNumber(stage)}</strong></div>
                <div><span>预计世界核心</span><strong className={autoRuleStatus.cores ? "is-met" : ""}>+{autoRuleStatus.previewCores}</strong></div>
                <div><span>累计跃迁</span><strong className={autoRuleStatus.leaps ? "is-met" : ""}>{totalLeaps}</strong></div>
              </div>
              <label className="auto-leap-toggle">
                <input
                  type="checkbox"
                  checked={autoRule.enabled}
                  onChange={(event) => updateAutoLeapRule({ enabled: event.target.checked })}
                />
                <span>{autoRule.enabled ? "策略监控已启用" : "策略已暂停"}</span>
              </label>
              <div className="auto-leap-controls">
                <label>
                  <span>当前关卡至少</span>
                  <input type="number" min="0" step="100" value={autoRule.minStage} onChange={(event) => updateAutoLeapRule({ minStage: Number(event.target.value) })} />
                  <i className={autoRuleStatus.stage ? "is-met" : ""}>{autoRuleStatus.stage ? "已满足" : "未满足"}</i>
                </label>
                <label>
                  <span>预计核心至少</span>
                  <input type="number" min="1" step="1" value={autoRule.minCores} onChange={(event) => updateAutoLeapRule({ minCores: Number(event.target.value) })} />
                  <i className={autoRuleStatus.cores ? "is-met" : ""}>{autoRuleStatus.cores ? "已满足" : "未满足"}</i>
                </label>
                <label>
                  <span>累计跃迁至少</span>
                  <input type="number" min="3" step="1" value={autoRule.minTotalLeaps} onChange={(event) => updateAutoLeapRule({ minTotalLeaps: Number(event.target.value) })} />
                  <i className={autoRuleStatus.leaps ? "is-met" : ""}>{autoRuleStatus.leaps ? "已满足" : "未满足"}</i>
                </label>
              </div>
              <p className="auto-leap-note">以上条件需要同时满足，并且仍需达到本次跃迁硬门槛。可用“预计核心 ≥ X”继续推进更深关卡后再自动跃迁。</p>
            </>
          )}
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
            本世界线的升级、装备、技能、天赋、重构将被完全重置；下次重构门槛回到 500 关，保留成就/统计与已购世界核心升级。
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
