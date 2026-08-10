"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber, formatBigPrecise } from "@/game/format";
import { toBig } from "@/game/bignum";
import { prestigeEnergy, prestigeGlobalMult as pm } from "@/game/formulas";
import { CONFIG } from "@/game/config";
import type { ChallengeId, PrestigeUpgradeId } from "@/game/types";
import { shopCostFrom, canBuyFrom } from "@/game/systems/prestige";
import { LeapPanel } from "@/components/leap/LeapPanel";
import { LawPanel } from "@/components/law/LawPanel";

const SHOP_ORDER: PrestigeUpgradeId[] = ["startPower", "goldKeep", "fastSkip", "startSkill", "singularityAmp"];
const CHALLENGE_ORDER: ChallengeId[] = ["no_crit", "slow_universe", "poverty"];

export function PrestigePanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("prestige"));
  const energy = useGameSelector((s) => s.prestige.energy);
  const purchases = useGameSelector((s) => s.prestige.purchases);
  const runDamage = useGameSelector((s) => s.statistics.runDamage);
  const activeChallenge = useGameSelector((s) => s.meta.activeChallenge);
  const challenges = useGameSelector((s) => s.challenges);
  const [confirm, setConfirm] = useState(false);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>重构</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>推进到第 {CONFIG.UNLOCKS.find((u) => u.key === "prestige")?.stage ?? 400} 关解锁重构。让当前计算宇宙坍缩，带走奇点能量。</p>
      </div>
    );
  }

  const previewEnergy = prestigeEnergy(toBig(runDamage));
  const previewMult = pm(energy + previewEnergy, purchases.singularityAmp ?? 0);
  const canPrestige = engine?.canPrestige() ?? false;

  return (
    <div className="panel">
      <h3>重构（第一层重置）</h3>
      <div className="prestige-info">
        <div>当前奇点能量：<span className="prestige-energy mono">{formatNumber(energy)}</span></div>
        <div>当前全局倍率：<span className="mono">×{formatBigPrecise(pm(energy, purchases.singularityAmp ?? 0))}</span></div>
        {canPrestige && (
          <div style={{ marginTop: 4, color: "var(--green)" }}>
            重构可获 <span className="mono">+{previewEnergy}</span> 能量 → 倍率 <span className="mono">×{formatBigPrecise(previewMult)}</span>
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          重构将重置：关卡、金币、基础升级（保留：装备、技能、天赋、成就、统计）。
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!canPrestige} onClick={() => setConfirm(true)}>
          坍缩宇宙（重构）
        </button>
      </div>

      <h3 style={{ marginTop: 14 }}>重构商店</h3>
      {SHOP_ORDER.map((id) => {
        const def = CONFIG.PRESTIGE.SHOP[id];
        const cur = purchases[id] ?? 0;
        const cost = shopCostFrom(energy, purchases, id);
        const maxed = cur >= def.max;
        const affordable = canBuyFrom(energy, purchases, id);
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.label} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{cur}/{def.max}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            <button className="mini-btn" disabled={maxed || !affordable} onClick={() => engine?.buyPrestigeUpgrade(id)}>
              {maxed ? "已满" : `${formatNumber(cost)} 能量`}
            </button>
          </div>
        );
      })}


      <h3 style={{ marginTop: 14 }}>挑战模式</h3>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
        开启挑战会重置本局（关卡/金币/升级），保留装备/技能/天赋/永久升级。通关一次领取永久奖励。
      </p>
      {CHALLENGE_ORDER.map((id) => {
        const def = CONFIG.CHALLENGES[id];
        const prog = challenges[id];
        const active = activeChallenge === id;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.icon} {def.name} {active && <span style={{ color: "var(--green)" }}>（进行中）</span>}</div>
              <div className="desc">{def.desc}</div>
              <div className="desc">目标 {def.target} 关 · 最高 {prog.best} · 奖励：{def.rewardCores} 核心 + {def.rewardTalent} 天赋点</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {prog.claimed ? (
                <span style={{ color: "var(--green)", fontSize: 12 }}>✓ 已通关</span>
              ) : (
                <button className="mini-btn" disabled={!engine?.canClaimChallenge(id)} onClick={() => engine?.claimChallenge(id)}>
                  {prog.best >= def.target ? "领取奖励" : "未通关"}
                </button>
              )}
              <button className="mini-btn" onClick={() => (active ? engine?.stopChallenge() : engine?.startChallenge(id))}>
                {active ? "停用" : "开启"}
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 18 }}><LeapPanel /></div>
      <div style={{ marginTop: 18 }}><LawPanel /></div>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>确认重构？</h2>
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              将获得 <span className="mono" style={{ color: "var(--super)" }}>{previewEnergy}</span> 奇点能量，全局倍率变为 <span className="mono">×{formatBigPrecise(previewMult)}</span>。
              <br />
              重置：关卡、金币、基础升级。保留：装备、技能、天赋。
            </p>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setConfirm(false)}>取消</button>
              <button className="btn danger" onClick={() => { engine?.prestige(); setConfirm(false); }}>确认重构</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}