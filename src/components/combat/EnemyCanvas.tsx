"use client";
// 程序化敌人渲染：每个世界一种几何形态，Boss 带能量光环与词缀视觉，受击白闪
// 纯 Canvas 绘制，无任何美术资产（遵守全局规则：运行时零第三方依赖）
import { useEffect, useRef } from "react";
import { useGame } from "@/components/game/GameProvider";
import type { BossAffix, WorldId } from "@/game/types";

interface Props {
  worldId: WorldId;
  worldColor: string;
  isBoss: boolean;
  affixes: BossAffix[];
}

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;

export function EnemyCanvas({ worldId, worldColor, isBoss, affixes }: Props) {
  const { engine } = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const flashUntil = useRef(0);

  useEffect(() => {
    if (!engine) return;
    return engine.onEvent((ev) => {
      if (ev.type === "hit") flashUntil.current = performance.now() + 90;
    });
  }, [engine]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const flash = now < flashUntil.current;

      // Boss 能量光环（在主体下方）
      if (isBoss) {
        drawBossHalo(ctx, t, worldColor, affixes);
      }

      switch (worldId) {
        case "data_wastes": drawDataWastes(ctx, t, worldColor, isBoss); break;
        case "mech_city": drawMechCity(ctx, t, worldColor, isBoss); break;
        case "star_factory": drawStarFactory(ctx, t, worldColor, isBoss); break;
        case "black_hole": drawBlackHole(ctx, t, worldColor, isBoss); break;
        default: drawDataWastes(ctx, t, worldColor, isBoss);
      }

      // 词缀叠加特效
      for (const a of affixes) drawAffixEffect(ctx, t, a);

      // 受击白闪
      if (flash) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(CX, CY, (isBoss ? 74 : 54), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldId, worldColor, isBoss, affixes]);

  return <canvas className="enemy-canvas" width={SIZE} height={SIZE} ref={ref} aria-hidden="true" />;
}

// ---------- 工具 ----------
function poly(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rot: number, close = true): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

function glow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 世界形态 ----------
function drawDataWastes(ctx: CanvasRenderingContext2D, t: number, color: string, isBoss: boolean): void {
  // 旋转线框立方体 + 漂浮二进制位
  const s = isBoss ? 64 : 48;
  const rx = t * 0.6;
  const ry = t * 0.35;
  const pts: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push([sx, sy, sz]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    let diff = 0;
    for (let k = 0; k < 3; k++) if (pts[i][k] !== pts[j][k]) diff++;
    if (diff === 1) edges.push([i, j]);
  }
  const proj = (p: [number, number, number]): [number, number] => {
    // 旋转 X/Y
    const y1 = p[1] * Math.cos(rx) - p[2] * Math.sin(rx);
    const z1 = p[1] * Math.sin(rx) + p[2] * Math.cos(rx);
    const x2 = p[0] * Math.cos(ry) + z1 * Math.sin(ry);
    const z2 = -p[0] * Math.sin(ry) + z1 * Math.cos(ry);
    return [CX + x2 * s, CY + y1 * s - z2 * s * 0.35];
  };
  const projPts = pts.map(proj);
  glow(ctx, CX, CY, s * 1.6, color, 0.12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [a, b] of edges) {
    ctx.beginPath();
    ctx.moveTo(projPts[a][0], projPts[a][1]);
    ctx.lineTo(projPts[b][0], projPts[b][1]);
    ctx.stroke();
  }
  // 顶点光点
  ctx.fillStyle = "#ffffff";
  for (const [x, y] of projPts) {
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  // 漂浮 0/1
  ctx.font = "10px monospace";
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 5; i++) {
    const fx = CX - 60 + ((i * 37 + t * 22) % 120);
    const fy = CY - 50 + ((i * 53 + t * 14) % 100);
    ctx.fillText(i % 2 === 0 ? "0" : "1", fx, fy);
  }
  ctx.globalAlpha = 1;
}

function drawMechCity(ctx: CanvasRenderingContext2D, t: number, color: string, isBoss: boolean): void {
  // 旋转齿轮六边形
  const s = isBoss ? 66 : 50;
  const rot = t * 0.5;
  glow(ctx, CX, CY, s * 1.5, color, 0.12);
  // 外齿
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(rot);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * (s - 4), Math.sin(a0) * (s - 4));
    ctx.lineTo(Math.cos(a0) * (s + 8), Math.sin(a0) * (s + 8));
    ctx.stroke();
  }
  poly(ctx, 0, 0, s, 6, rot, true);
  ctx.stroke();
  // 内环
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  // 铆钉
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 中心芯
  ctx.fillStyle = "#ffd93d";
  ctx.beginPath();
  ctx.arc(CX, CY, isBoss ? 14 : 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawStarFactory(ctx: CanvasRenderingContext2D, t: number, color: string, isBoss: boolean): void {
  // 热核恒星：脉动多边形 + 光晕
  const base = isBoss ? 60 : 44;
  const pulse = 1 + 0.08 * Math.sin(t * 3);
  const s = base * pulse;
  const rot = t * 0.3;
  glow(ctx, CX, CY, s * 2.4, "#ff8c42", 0.2 + 0.1 * Math.sin(t * 3));
  glow(ctx, CX, CY, s * 1.4, "#ffd93d", 0.25);
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  poly(ctx, 0, 0, s, 5, -Math.PI / 2, true);
  ctx.fill();
  ctx.fillStyle = "#ffd93d";
  poly(ctx, 0, 0, s * 0.45, 5, -Math.PI / 2 + Math.PI / 5, true);
  ctx.fill();
  ctx.restore();
  // 日冕粒子
  ctx.fillStyle = "#ffd93d";
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 6; i++) {
    const a = t * 1.2 + (i / 6) * Math.PI * 2;
    const r = s * (1.35 + 0.3 * Math.sin(t * 2 + i));
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBlackHole(ctx: CanvasRenderingContext2D, t: number, color: string, isBoss: boolean): void {
  // 黑洞：吸积盘环 + 中心暗球 + 引力弧
  const s = isBoss ? 62 : 46;
  glow(ctx, CX, CY, s * 2.2, "#b26bff", 0.18 + 0.06 * Math.sin(t * 2));
  // 吸积盘（旋转椭圆环）
  for (let ring = 0; ring < 3; ring++) {
    const rr = s * (0.8 + ring * 0.35);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(t * (0.5 + ring * 0.2) + ring * 0.8);
    ctx.scale(1, 0.35);
    ctx.strokeStyle = ring === 1 ? "#ff9ff3" : color;
    ctx.lineWidth = ring === 1 ? 4 : 2;
    ctx.globalAlpha = 0.5 + ring * 0.15;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // 中心暗球 + 边缘光
  ctx.fillStyle = "#0a0a14";
  ctx.beginPath();
  ctx.arc(CX, CY, s * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff9ff3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, s * 0.5, t * 0.6, t * 0.6 + Math.PI * 1.4);
  ctx.stroke();
  // 引力弧（外侧弯曲光线）
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(CX, CY, s * (1.5 + i * 0.3), t * 0.4 + i * 2, t * 0.4 + i * 2 + 1.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- Boss 光环 ----------
function drawBossHalo(ctx: CanvasRenderingContext2D, t: number, color: string, affixes: BossAffix[]): void {
  const r = 92 + Math.sin(t * 2) * 3;
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(t * 0.3);
  // 双层旋转光环
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = k === 0 ? color : "#ffd93d";
    ctx.lineWidth = k === 0 ? 3 : 2;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash(k === 0 ? [] : [10, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, r + k * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  void affixes;
}

// ---------- 词缀特效 ----------
function drawAffixEffect(ctx: CanvasRenderingContext2D, t: number, affix: BossAffix): void {
  const r = 66;
  switch (affix) {
    case "armor": {
      // 护盾弧
      ctx.strokeStyle = "#9ad0ff";
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(CX, CY, r, -0.6 + t * 0.8, 0.6 + t * 0.8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case "regen": {
      // 绿色回复粒子
      ctx.fillStyle = "#3ddc84";
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 4; i++) {
        const a = t * 1.4 + (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "antiCrit": {
      // 反暴击旋涡
      ctx.strokeStyle = "#9ad0ff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(CX, CY, r - i * 14, t * 1.2 + i * 1.2, t * 1.2 + i * 1.2 + Math.PI * 1.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "rage": {
      // 火焰
      ctx.fillStyle = "#ff6b3d";
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + t;
        const rr = r + 6 + Math.sin(t * 6 + i * 2) * 5;
        ctx.beginPath();
        ctx.arc(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "harden": {
      // 硬化岩层环
      ctx.strokeStyle = "#c9a66b";
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(CX, CY, r + 2, t * 0.3, t * 0.3 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      break;
    }
    case "deflect": {
      // 镜面闪光
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 5);
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
  }
}