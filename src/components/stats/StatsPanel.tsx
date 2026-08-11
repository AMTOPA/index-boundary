"use client";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { Big, toBig } from "@/game/bignum";
import { formatBig, formatNumber, formatDuration, formatPct } from "@/game/format";
import { CONFIG } from "@/game/config";
import {
  enemyHp, enemyGold, bossHp, upgradeCost, prestigeEnergy, prestigeGlobalMult,
  expectedCritMult, effectiveAps, goldMultFromLevel, critChanceFromLevel, critDamageFromLevel,
} from "@/game/formulas";
import type { UpgradeId } from "@/game/types";

const UPGRADE_IDS: UpgradeId[] = ["attack", "aspd", "critChance", "critDamage", "gold"];
const UPGRADE_LABEL: Record<UpgradeId, string> = {
  attack: "攻击", aspd: "攻速", critChance: "暴击率", critDamage: "暴伤", gold: "金币",
};

export function StatsPanel() {
  const stats = useGameSelector((s) => s.statistics);
  const recorder = useGameSelector((s) => (s.items.toolLevels.combat_recorder ?? 0) > 0 || s.items.tools.combat_recorder === true);
  const stage = useGameSelector((s) => s.combat.stage);
  const upgrades = useGameSelector((s) => s.player.upgrades);
  const prestige = useGameSelector((s) => s.prestige);
  const d = useDerived();

  // ---- 实时战斗指标（估算） ----
  const killTimeSec = (() => {
    const hp = enemyHp(stage, d.hpGrowth);
    const t = hp.div(d.dps).toNumber();
    return Number.isFinite(t) ? Math.max(0.001, t) : Infinity;
  })();
  const goldPerSec = (() => {
    if (!Number.isFinite(killTimeSec)) return Infinity;
    return enemyGold(stage, d.hpGrowth).mul(d.goldMult).div(d.dps).toNumber();
  })();
  const bossKillSec = (() => {
    const eff = d.dps.mul(d.bossDmgMult);
    const t = bossHp(stage, d.hpGrowth).mul(d.bossHpMult).div(eff).toNumber();
    return Number.isFinite(t) ? t : Infinity;
  })();

  // ---- 升级回本（估算）：成本 / (金币每秒 × 提升比例) ----
  const paybacks = UPGRADE_IDS.map((id) => {
    const lv = upgrades[id] ?? 0;
    const cost = upgradeCost(id, lv).toNumber();
    let gain = 0;
    if (id === "attack") gain = 1.12 - 1;
    else if (id === "aspd") {
      const next = effectiveAps(d.panelAps * CONFIG.UPGRADES.aspd.effectPerLevel);
      gain = next / Math.max(0.0001, d.effectiveAps) - 1;
    } else if (id === "critChance") {
      const c0 = critChanceFromLevel(lv);
      const c1 = critChanceFromLevel(lv + 1);
      gain = expectedCritMult(c1, d.critDamage, d.critLayersExtra).div(
        Big.max(Big.ONE, expectedCritMult(c0, d.critDamage, d.critLayersExtra))).toNumber() - 1;
    } else if (id === "critDamage") {
      const d0 = critDamageFromLevel(lv);
      const d1 = critDamageFromLevel(lv + 1);
      gain = expectedCritMult(d.critChance, Big.fromNumber(d1), d.critLayersExtra).div(
        Big.max(Big.ONE, expectedCritMult(d.critChance, Big.fromNumber(d0), d.critLayersExtra))).toNumber() - 1;
    } else if (id === "gold") {
      gain = goldMultFromLevel(lv + 1) / Math.max(0.0001, goldMultFromLevel(lv)) - 1;
    }
    if (!Number.isFinite(cost) || cost <= 0 || gain <= 0.001 || !Number.isFinite(goldPerSec) || goldPerSec <= 0) {
      return { id, cost, payback: Infinity };
    }
    return { id, cost, payback: cost / (goldPerSec * gain) };
  });

  // ---- 重构预计 ----
  const runMag = toBig(stats.runDamage).log10();
  const previewEnergy = prestigeEnergy(toBig(stats.runDamage));
  const previewMult = prestigeGlobalMult(prestige.energy + previewEnergy, prestige.purchases.singularityAmp ?? 0);

  return (
    <section className="panel stats-panel" aria-labelledby="stats-heading">
      <h3 id="stats-heading">统计</h3>
      <div className="stat-grid">
        <div className="stat-item"><div className="k">当前 DPS</div><div className="v mono" style={{ color: "var(--accent)" }}>{formatBig(d.dps)}</div></div>
        <div className="stat-item"><div className="k">单次伤害</div><div className="v mono">{formatBig(d.damagePerHit)}</div></div>
        <div className="stat-item"><div className="k">暴击率 / 暴伤</div><div className="v mono">{formatPct(d.critChance)} / ×{formatBig(d.critDamage)}</div></div>
        <div className="stat-item"><div className="k">有效攻速</div><div className="v mono">{d.effectiveAps.toFixed(2)}/s（面板 {d.panelAps.toFixed(1)}）</div></div>
        <div className="stat-item"><div className="k">金币倍率</div><div className="v mono">{formatBig(d.goldMult)}</div></div>
        <div className="stat-item"><div className="k">Boss 伤害</div><div className="v mono">×{formatBig(d.bossDmgMult)}</div></div>
      </div>
      {!recorder && (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          获得「战斗记录仪」解锁完整统计。
        </p>
      )}
      {recorder && (
        <>
          <h3 style={{ marginTop: 12 }}>实时战斗指标（估算）</h3>
          <div className="stat-grid">
            <div className="stat-item"><div className="k">面板 DPS（无暴击）</div><div className="v mono">{formatBig(d.damagePerHit.mul(toBig(Math.max(0.0001, d.effectiveAps))))}</div></div>
            <div className="stat-item"><div className="k">期望 DPS（含暴击）</div><div className="v mono">{formatBig(d.dps)}</div></div>
            <div className="stat-item"><div className="k">金币/秒（当前关）</div><div className="v mono">{Number.isFinite(goldPerSec) ? formatNumber(goldPerSec) : "∞"}</div></div>
            <div className="stat-item"><div className="k">平均击杀时间</div><div className="v mono">{Number.isFinite(killTimeSec) ? formatDuration(killTimeSec) : "∞"}</div></div>
            <div className="stat-item"><div className="k">Boss 预计击杀</div><div className="v mono">{Number.isFinite(bossKillSec) ? formatDuration(bossKillSec) : "∞"}</div></div>
            <div className="stat-item"><div className="k">当前关卡</div><div className="v mono">{stage}</div></div>
          </div>

          <h3 style={{ marginTop: 12 }}>升级回本（估算）</h3>
          <div className="stat-grid">
            {paybacks.map((p) => (
              <div className="stat-item" key={p.id}>
                <div className="k">{UPGRADE_LABEL[p.id]} · 成本 {p.cost === Infinity ? "∞" : formatNumber(p.cost)}</div>
                <div className="v mono" style={{ color: Number.isFinite(p.payback) && p.payback < 60 ? "var(--green)" : "var(--text)" }}>
                  {Number.isFinite(p.payback) ? formatDuration(p.payback) : "—"}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 12 }}>重构预计</h3>
          <div className="stat-grid">
            <div className="stat-item"><div className="k">本局伤害</div><div className="v mono">{formatBig(toBig(stats.runDamage))}</div></div>
            <div className="stat-item"><div className="k">伤害数量级</div><div className="v mono">{Number.isFinite(runMag) ? `10^${runMag.toFixed(1)}` : "—"}</div></div>
            <div className="stat-item"><div className="k">重构可获能量</div><div className="v mono" style={{ color: "var(--super)" }}>{formatNumber(previewEnergy)}</div></div>
            <div className="stat-item"><div className="k">新全局倍率</div><div className="v mono">{formatBig(previewMult)}</div></div>
          </div>

          <h3 style={{ marginTop: 12 }}>完整统计</h3>
          <div className="stat-grid">
            <div className="stat-item"><div className="k">总伤害</div><div className="v mono">{formatBig(toBig(stats.totalDamage))}</div></div>
            <div className="stat-item"><div className="k">最高单次</div><div className="v mono">{formatBig(toBig(stats.highestHit))}</div></div>
            <div className="stat-item"><div className="k">总金币</div><div className="v mono">{formatBig(toBig(stats.totalGold))}</div></div>
            <div className="stat-item"><div className="k">击杀 / Boss</div><div className="v mono">{formatNumber(stats.totalKills)} / {formatNumber(stats.totalBossKills)}</div></div>
            <div className="stat-item"><div className="k">精英 / 宝箱怪</div><div className="v mono">{formatNumber(stats.totalEliteKills)} / {formatNumber(stats.totalMimicKills)}</div></div>
            <div className="stat-item"><div className="k">点击 / 暴击</div><div className="v mono">{formatNumber(stats.totalClicks)} / {formatNumber(stats.totalCrits)}</div></div>
            <div className="stat-item"><div className="k">超暴击 / 技能</div><div className="v mono">{formatNumber(stats.totalSuperCrits)} / {formatNumber(stats.totalSkillCasts)}</div></div>
            <div className="stat-item"><div className="k">重构次数</div><div className="v mono">{formatNumber(stats.totalPrestiges)}</div></div>
            <div className="stat-item"><div className="k">最高关卡</div><div className="v mono">{formatNumber(stats.allTimeMaxStage)}</div></div>
            <div className="stat-item"><div className="k">在线时长</div><div className="v">{formatDuration(stats.totalPlayTimeMs / 1000)}</div></div>
            <div className="stat-item"><div className="k">离线时长</div><div className="v">{formatDuration(stats.totalOfflineMs / 1000)}</div></div>
          </div>
          <h3 style={{ marginTop: 12 }}>乘区分解</h3>
          <div className="stat-grid">
            <div className="stat-item"><div className="k">基础攻击</div><div className="v mono">{formatBig(d.baseAttack)}</div></div>
            <div className="stat-item"><div className="k">攻击加成池</div><div className="v mono">×{formatBig(d.attackMult)}</div></div>
            <div className="stat-item"><div className="k">天赋倍率</div><div className="v mono">×{formatBig(d.talentMult)}</div></div>
            <div className="stat-item"><div className="k">重构倍率</div><div className="v mono">×{formatBig(d.prestigeMult)}</div></div>
            <div className="stat-item"><div className="k">全局倍率</div><div className="v mono">×{formatBig(d.globalMult)}</div></div>
            <div className="stat-item"><div className="k">技能倍率</div><div className="v mono">×{formatBig(d.skillDmgMult)}</div></div>
            <div className="stat-item"><div className="k">技能冷却</div><div className="v mono">×{d.skillCdMult.toFixed(2)}</div></div>
            <div className="stat-item"><div className="k">技能持续</div><div className="v mono">×{d.skillDurationMult.toFixed(2)}</div></div>
          </div>
        </>
      )}
    </section>
  );
}