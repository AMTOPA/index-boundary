"use client";
// 开发用平衡工具：查看曲线、自动玩家模拟、三策略对比。生产构建也会包含此页，但仅作内部工具。
import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG } from "@/game/config";
import { enemyHp, enemyGold, bossHp } from "@/game/formulas";
import { Big } from "@/game/bignum";
import { formatBig, formatNumber, formatDuration } from "@/game/format";
import { runAutoPlayer, type SimStrategy } from "@/game/simulator";

const STRATEGY_LABEL: Record<SimStrategy, string> = {
  equal: "均衡（smartBuy）",
  attack: "攻击优先",
  gold: "金币优先",
  crit: "暴击流",
  aspd: "攻速流",
};

const CURVE_STAGES = [1, 5, 10, 25, 50, 100, 200, 300, 350, 400, 500];

export default function BalancePage() {
  const [rows, setRows] = useState<ReturnType<typeof runAutoPlayer>[]>([]);
  const [running, setRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleRun = useCallback((seconds: number) => {
    setRunning(true);
    window.setTimeout(() => {
      const hours = seconds / 3600;
      const out: ReturnType<typeof runAutoPlayer>[] = [];
      (["equal", "attack", "gold", "crit", "aspd"] as SimStrategy[]).forEach((s) => {
        out.push(runAutoPlayer({ hours, seed: 424242, strategy: s }));
      });
      setRows(out);
      setRunning(false);
    }, 20);
  }, []);

  // 绘制 HP / 金币 曲线
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const baseW = canvas.clientWidth || 800;
    const W = canvas.width = baseW * dpr;
    const H = canvas.height = 220 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, baseW, 220);
    const stages = CURVE_STAGES;
    const hpLog = stages.map((s) => enemyHp(s).log10());
    const bossLog = stages.map((s) => bossHp(s).log10());
    const goldLog = stages.map((s) => enemyGold(s).log10());
    const maxLog = Math.max(...hpLog, ...bossLog, ...goldLog);
    const minLog = 0;
    const pad = 30;
    const x = (i: number) => pad + (i / (stages.length - 1)) * (baseW - pad * 2);
    const y = (v: number) => 220 - pad - ((v - minLog) / (maxLog - minLog)) * (220 - pad * 2);
    const draw = (vals: number[], color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      vals.forEach((v, i) => { const px = x(i), py = y(v); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.stroke();
    };
    draw(hpLog, "#35c6f0");
    draw(bossLog, "#ff6b6b");
    draw(goldLog, "#ffd93d");
    ctx.fillStyle = "#7c8fae"; ctx.font = "11px sans-serif";
    ctx.fillText("蓝=怪物HP(log10)", pad, 12);
    ctx.fillText("红=BossHP(log10)", pad + 130, 12);
    ctx.fillText("黄=金币(log10)", pad + 260, 12);
  }, [rows]);

  return (
    <div className="app" style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, margin: "8px 0" }}>🛠 平衡模拟器（开发用）</h1>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
        /dev/balance · 自动玩家模拟 + 数值曲线。模拟为纯引擎 headless 运行（自动购买/技能/装备/天赋/重构），与游戏逻辑一致。
      </p>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-title"><h3>怪物曲线</h3></div>
        <table className="simple">
          <thead>
            <tr><th>关卡</th><th>怪物 HP</th><th>Boss HP</th><th>金币</th><th>击杀时间(按10⁶DPS)</th></tr>
          </thead>
          <tbody>
            {CURVE_STAGES.map((s) => (
              <tr key={s}>
                <td>{s}</td>
                <td>{formatBig(enemyHp(s))}</td>
                <td>{s % 10 === 0 ? formatBig(bossHp(s)) : "—"}</td>
                <td>{formatBig(enemyGold(s))}</td>
                <td>{formatDuration(Math.max(0, enemyHp(s).div(Big.fromNumber(1e6)).toNumber()))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <canvas ref={canvasRef} className="chart" style={{ height: 220 }} />
      </div>

      <div className="panel">
        <div className="panel-title">
          <h3>自动玩家模拟（三策略对比，固定种子可复现）</h3>
          <span className="hint">每次约 1~5 秒</span>
        </div>
        <div className="balance-row" style={{ margin: "8px 0" }}>
          <button className="btn primary" disabled={running} onClick={() => handleRun(3600)}>模拟 1 小时</button>
          <button className="btn" disabled={running} onClick={() => handleRun(10 * 3600)}>模拟 10 小时</button>
          {running && <span style={{ color: "var(--accent)", fontSize: 13 }}>模拟中…</span>}
        </div>
        {rows.length > 0 && (
          <table className="simple">
            <thead>
              <tr>
                <th>策略</th><th>当前关卡</th><th>历史最高</th><th>DPS</th><th>金币</th>
                <th>总伤数量级</th><th>击杀</th><th>Boss击杀</th><th>重构</th><th>能量</th>
                <th>首重构</th><th>到100关</th><th>到300关</th><th>到400关</th><th>到500关</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.strategy}-${r.hours}`}>
                  <td>{STRATEGY_LABEL[r.strategy]}</td>
                  <td>{r.stage}</td>
                  <td>{r.maxStage}</td>
                  <td>{formatBig(r.dps)}</td>
                  <td>{formatBig(r.gold)}</td>
                  <td>10^{formatNumber(r.totalDamageMag)}</td>
                  <td>{formatNumber(r.kills)}</td>
                  <td>{formatNumber(r.bossKills)}</td>
                  <td>{formatNumber(r.prestiges)}</td>
                  <td>{formatNumber(r.energy)}</td>
                  <td>{r.firstPrestigeAt >= 0 ? formatDuration(r.firstPrestigeAt) : "—"}</td>
                  <td>{r.timeTo100 >= 0 ? formatDuration(r.timeTo100) : "—"}</td>
                  <td>{r.timeTo300 >= 0 ? formatDuration(r.timeTo300) : "—"}</td>
                  <td>{r.timeTo400 >= 0 ? formatDuration(r.timeTo400) : "—"}</td>
                  <td>{r.timeTo500 >= 0 ? formatDuration(r.timeTo500) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}