"use client";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { NumberDisplay } from "@/components/common/NumberDisplay";
import { toBig } from "@/game/bignum";
import { formatBig, formatNumber, formatDuration, formatPct } from "@/game/format";

export function StatsPanel() {
  const stats = useGameSelector((s) => s.statistics);
  const recorder = useGameSelector((s) => s.items.tools.combat_recorder === true);
  const d = useDerived();

  return (
    <div className="panel">
      <h3>统计</h3>
      <div className="stat-grid">
        <div className="stat-item"><div className="k">当前 DPS</div><div className="v mono" style={{ color: "var(--accent)" }}>{formatBig(d.dps)}</div></div>
        <div className="stat-item"><div className="k">单次伤害</div><div className="v mono">{formatBig(d.damagePerHit)}</div></div>
        <div className="stat-item"><div className="k">暴击率 / 暴伤</div><div className="v mono">{formatPct(d.critChance)} / ×{d.critDamage.toFixed(2)}</div></div>
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
          <h3 style={{ marginTop: 12 }}>完整统计</h3>
          <div className="stat-grid">
            <div className="stat-item"><div className="k">总伤害</div><div className="v mono">{formatBig(toBig(stats.totalDamage))}</div></div>
            <div className="stat-item"><div className="k">最高单次</div><div className="v mono">{formatBig(toBig(stats.highestHit))}</div></div>
            <div className="stat-item"><div className="k">总金币</div><div className="v mono">{formatBig(toBig(stats.totalGold))}</div></div>
            <div className="stat-item"><div className="k">击杀 / Boss</div><div className="v mono">{formatNumber(stats.totalKills)} / {formatNumber(stats.totalBossKills)}</div></div>
            <div className="stat-item"><div className="k">精英 / 宝箱怪</div><div className="v mono">{formatNumber(stats.totalEliteKills)} / {formatNumber(stats.totalMimicKills)}</div></div>
            <div className="stat-item"><div className="k">点击 / 暴击</div><div className="v mono">{formatNumber(stats.totalClicks)} / {formatNumber(stats.totalCrits)}</div></div>
            <div className="stat-item"><div className="k">超暴击</div><div className="v mono">{formatNumber(stats.totalSuperCrits)}</div></div>
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
          </div>
        </>
      )}
    </div>
  );
}