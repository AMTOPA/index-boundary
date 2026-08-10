"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { NumberDisplay } from "@/components/common/NumberDisplay";
import { toBig } from "@/game/bignum";
import { formatBig, formatPct } from "@/game/format";
import {
  upgradeCost, attackMult, panelApsFromLevel, effectiveAps,
  critChanceFromLevel, critDamageFromLevel, goldMultFromLevel,
} from "@/game/formulas";
import { CONFIG } from "@/game/config";
import type { UpgradeId } from "@/game/types";

interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  gate: string | null;
  effect: (level: number) => string;
  nextEffect: (level: number) => string;
  gainRatio: (level: number) => number; // 下一级收益倍率（用于判断是否接近上限）
}

const DEFS: UpgradeDef[] = [
  {
    id: "attack", name: "攻击", icon: "⚔️", gate: null,
    effect: (lv) => `×${formatBig(attackMult(lv))}`,
    nextEffect: (lv) => `×${formatBig(attackMult(lv + 1))}`,
    gainRatio: (lv) => attackMult(lv + 1).div(attackMult(lv)).toNumber() - 1,
  },
  {
    id: "aspd", name: "攻速", icon: "⚡", gate: "aspd_upgrade",
    effect: (lv) => `${effectiveAps(panelApsFromLevel(lv)).toFixed(2)}/s`,
    nextEffect: (lv) => `${effectiveAps(panelApsFromLevel(lv + 1)).toFixed(2)}/s`,
    gainRatio: (lv) => effectiveAps(panelApsFromLevel(lv + 1)) / effectiveAps(panelApsFromLevel(lv)) - 1,
  },
  {
    id: "critChance", name: "暴击率", icon: "🎯", gate: "crit",
    effect: (lv) => formatPct(critChanceFromLevel(lv)),
    nextEffect: (lv) => formatPct(critChanceFromLevel(lv + 1)),
    gainRatio: (lv) => critChanceFromLevel(lv + 1) / critChanceFromLevel(lv) - 1,
  },
  {
    id: "critDamage", name: "暴击伤害", icon: "💥", gate: "crit",
    effect: (lv) => `×${critDamageFromLevel(lv).toFixed(2)}`,
    nextEffect: (lv) => `×${critDamageFromLevel(lv + 1).toFixed(2)}`,
    gainRatio: (lv) => critDamageFromLevel(lv + 1) / critDamageFromLevel(lv) - 1,
  },
  {
    id: "gold", name: "金币", icon: "💰", gate: null,
    effect: (lv) => `×${goldMultFromLevel(lv).toFixed(2)}`,
    nextEffect: (lv) => `×${goldMultFromLevel(lv + 1).toFixed(2)}`,
    gainRatio: (lv) => goldMultFromLevel(lv + 1) / goldMultFromLevel(lv) - 1,
  },
];

const BULK_STEPS = [10, 25, 100];

export function UpgradePanel() {
  const { engine } = useGame();
  const upgrades = useGameSelector((s) => s.player.upgrades);
  const gold = useGameSelector((s) => s.player.gold);
  const unlocks = useGameSelector((s) => s.meta.unlocks);
  const derived = useDerived();

  const goldBig = toBig(gold);

  // 攻速：面板攻速达到软上限（含天赋/法则破限）即视为“已升满”，隐藏购买按钮
  const aspdSoftCap = CONFIG.APS_SOFT_CAP + derived.apsCapAdd + derived.apsCapTalent;
  const isNearCap = (id: UpgradeId, level: number): boolean => {
    if (level <= 0) return false;
    // 仅攻速（软上限）与暴击率（饱和上限）会接近上限；攻击/暴击伤害/金币均无上限，始终可买
    if (id === "aspd") return panelApsFromLevel(level) + derived.apsCapTalent >= aspdSoftCap;
    if (id === "critChance") {
      const def = DEFS.find((d) => d.id === id);
      return def ? def.gainRatio(level) < CONFIG.UPGRADE_NEAR_CAP_RATIO : false;
    }
    return false;
  };
  return (
    <div className="panel">
      <div className="panel-title">
        <h3>升级</h3>
        <span className="hint">金币 <span className="mono" style={{ color: "var(--gold)" }}>{formatBig(goldBig)}</span></span>
      </div>
      {DEFS.map((def) => {
        const level = upgrades[def.id] ?? 0;
        const cost = upgradeCost(def.id, level);
        const afford = goldBig.gte(cost);
        const gated = def.gate !== null && !unlocks.includes(def.gate);
        // 关卡等级上限：攻速/暴击率/暴伤 上限 = 当前关卡数（推关解锁）；攻击/金币不设限
        const stageCap = engine?.upgradeMaxLevel(def.id) ?? null;
        const capped = stageCap !== null && level >= stageCap;
        const nearCap = !gated && !capped && isNearCap(def.id, level);
        return (
          <div className="upgrade-row" key={def.id} style={gated ? { opacity: 0.4 } : undefined}>
            <div className="upgrade-info">
              <div className="upgrade-name">{def.icon} {def.name} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{level}</span></div>
              <div className="upgrade-effect">{def.effect(level)}{def.gate === null || unlocks.includes(def.gate!) ? ` → ${def.nextEffect(level)}` : "（未解锁）"}</div>
              <div className="upgrade-cost">费用 <NumberDisplay value={cost} /></div>
            </div>
            {!gated && !capped && !nearCap && (
              <div className="upgrade-buy">
                <button className={`buy-btn ${afford ? "afford" : ""}`} disabled={!afford} onClick={() => engine?.buyUpgrade(def.id)}>购买</button>
                <div className="buy-counts">
                  {BULK_STEPS.map((n) => (
                    <button key={n} className="mini-btn" onClick={() => engine?.buyUpgradeTimes(def.id, n)}>×{n}</button>
                  ))}
                  <button key="max" className="mini-btn buy-max" onClick={() => engine?.buyUpgradeMax(def.id)}>MAX</button>
                </div>
              </div>
            )}
            {!gated && capped && (
              <span className="near-cap-tag stage-cap-tag">已达关卡上限 Lv{stageCap}（推关解锁）</span>
            )}
            {!gated && !capped && nearCap && (
              <span className="near-cap-tag">{def.id === "aspd" ? "已达攻速软上限" : "已近上限"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}