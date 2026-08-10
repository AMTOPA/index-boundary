"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber, formatBigPrecise } from "@/game/format";
import { toBig } from "@/game/bignum";
import { prestigeEnergy, prestigeGlobalMult as pm } from "@/game/formulas";
import { CONFIG } from "@/game/config";
import type { ChallengeId, PrestigeUpgradeId, SeasonTierId } from "@/game/types";
import { shopCostFrom, canBuyFrom } from "@/game/systems/prestige";
import { LeapPanel } from "@/components/leap/LeapPanel";
import { LawPanel } from "@/components/law/LawPanel";

const SHOP_ORDER: PrestigeUpgradeId[] = ["startPower", "goldKeep", "fastSkip", "startSkill", "singularityAmp"];
const CHALLENGE_ORDER: ChallengeId[] = ["no_crit", "slow_universe", "poverty", "durable", "skill_slow"];
const SEASON_TIER_ORDER: SeasonTierId[] = ["bronze", "silver", "gold"];

export function PrestigePanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("prestige"));
  const energy = useGameSelector((s) => s.prestige.energy);
  const purchases = useGameSelector((s) => s.prestige.purchases);
  const runDamage = useGameSelector((s) => s.statistics.runDamage);
  const activeChallenge = useGameSelector((s) => s.meta.activeChallenge);
  const activeModifiers = useGameSelector((s) => s.meta.activeModifiers);
  const challenges = useGameSelector((s) => s.challenges);
  const season = useGameSelector((s) => s.season);
  const [confirm, setConfirm] = useState(false);
  const [picked, setPicked] = useState<ChallengeId[]>(() => [...(season?.lastModifiers ?? [])].slice(0, CONFIG.SEASON.MAX_MODIFIERS));

  const toggleMod = (id: ChallengeId) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= CONFIG.SEASON.MAX_MODIFIERS) return prev;
      return [...prev, id];
    });
  };

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
      <h3 style={{ marginTop: 14 }}>试炼赛季（Roguelite）</h3>
      {!engine?.isSeasonUnlocked() ? (
        <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>
          通关全部基础挑战后解锁试炼赛季：自选 1~3 个修饰符叠加冲分，按赛季分领取铜 / 银 / 金档奖励。
          <br />
          当前进度：{CONFIG.SEASON.UNLOCK_CHALLENGES.filter((id) => challenges[id]?.claimed).length} / {CONFIG.SEASON.UNLOCK_CHALLENGES.length}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8, lineHeight: 1.7 }}>
            自选 {CONFIG.SEASON.MAX_MODIFIERS} 个以内修饰符叠加开始赛季（重置本局，保留装备 / 技能 / 天赋 / 永久升级）。
            得分 = 关卡 ×（1 + 0.5 × 修饰符数），赛季中的进度同时计入对应基础挑战。
          </p>
          {activeModifiers.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--green)", marginBottom: 8 }}>
              赛季进行中：{activeModifiers.map((m) => CONFIG.CHALLENGES[m].icon).join(" ")}
              <span className="mono"> 当前得分 ≈ {engine ? engine.seasonScoreOf(engine.state.combat.stage) : 0}</span>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {CHALLENGE_ORDER.map((id) => {
              const def = CONFIG.CHALLENGES[id];
              const on = picked.includes(id);
              const disabled = activeModifiers.length > 0 || (!on && picked.length >= CONFIG.SEASON.MAX_MODIFIERS);
              return (
                <button key={id} className={`mini-btn ${on ? "buy-btn afford" : ""}`} disabled={disabled} onClick={() => toggleMod(id)}>
                  {def.icon} {def.name}{on ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              得分倍率 ×{formatNumber(1 + picked.length * CONFIG.SEASON.WEIGHT_PER_MODIFIER)}
            </span>
            <span style={{ marginLeft: "auto" }} className="mono">
              赛季最高分 {formatNumber(season.bestScore)} · 最高 {season.bestStage} 关
            </span>
          </div>
          <div style={{ marginBottom: 10 }}>
            {activeModifiers.length > 0 ? (
              <button className="mini-btn" onClick={() => engine?.stopSeason()}>停止赛季</button>
            ) : (
              <button
                className="btn primary"
                disabled={picked.length < 1}
                onClick={() => { engine?.startSeason(picked); }}
              >
                {picked.length >= 1 ? `开始赛季（${picked.length} 修饰符）` : "选择至少 1 个修饰符"}
              </button>
            )}
          </div>
          {SEASON_TIER_ORDER.map((tier) => {
            const def = CONFIG.SEASON.TIERS[tier];
            const claimed = season.claimedTiers.includes(tier);
            const can = engine?.canClaimSeasonTier(tier) ?? false;
            return (
              <div className="shop-row" key={tier}>
                <div>
                  <div>{def.name}档 <span className="mono" style={{ color: "var(--text-dim)" }}>{def.threshold} 分</span></div>
                  <div className="desc">
                    奖励：{def.rewardCores} 技能核心 + {def.rewardTalent} 天赋点{def.rewardShards > 0 ? ` + ${def.rewardShards} 法则碎片` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {claimed ? (
                    <span style={{ color: "var(--green)", fontSize: 12 }}>✓ 已领取</span>
                  ) : (
                    <button className="mini-btn" disabled={!can} onClick={() => engine?.claimSeasonTier(tier)}>
                      {season.bestScore >= def.threshold ? "领取奖励" : `未达到 ${def.threshold} 分`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
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