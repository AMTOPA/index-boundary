"use client";
// 战斗粒子层：命中火花 / 暴击 / 超暴击 / 碾压白闪 / 击杀爆裂 / Boss 击杀大爆发（Canvas，零依赖）
import { useEffect, useRef } from "react";
import { useGame } from "@/components/game/GameProvider";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string;
  size: number;
  kind: "spark" | "ring" | "shard";
}

export function CombatParticles() {
  const { engine } = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);
  const MAX_PARTICLES = 150;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const list = parts.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        const k = p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, k);
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        if (p.kind === "ring") {
          ctx.lineWidth = 3 * k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - k), 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === "shard") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.vx * 0.1);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else if (p.kind === "spark") {
          ctx.lineWidth = Math.max(1, p.size * k);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.8, p.size * k * 0.65), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const spawn = (p: Partial<Particle> & { kind: Particle["kind"]; color: string; x: number; y: number }) => {
      parts.current.push({ maxLife: 0.6, life: 0.6, vx: 0, vy: 0, size: 4, ...p } as Particle);
      if (parts.current.length > MAX_PARTICLES) {
        parts.current.splice(0, parts.current.length - MAX_PARTICLES);
      }
    };
    const center = (): { x: number; y: number } => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: rect.width / 2, y: rect.height * 0.42 };
    };
    const burst = (n: number, color: string, speed: number, kind: Particle["kind"] = "spark", size = 4) => {
      const c = center();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        spawn({
          x: c.x + (Math.random() - 0.5) * 40,
          y: c.y + (Math.random() - 0.5) * 30,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 20,
          color,
          size: size * (0.6 + Math.random() * 0.8),
          kind,
          maxLife: 0.4 + Math.random() * 0.5,
          life: 0.4 + Math.random() * 0.5,
        });
      }
    };

    return engine.onEvent((ev) => {
      switch (ev.type) {
        case "hit": {
          const c = center();
          spawn({ x: c.x + (Math.random() - 0.5) * 50, y: c.y + (Math.random() - 0.5) * 40, vx: 0, vy: -30, color: "#dfe8ff", size: 3, kind: "spark", maxLife: 0.3, life: 0.3 });
          if (ev.crit) burst(6, "#ffb52e", 130);
          if (ev.superCrit) { burst(16, "#b26bff", 180, "shard", 6); spawn({ x: c.x, y: c.y, color: "#b26bff", size: 40, kind: "ring", maxLife: 0.45, life: 0.45 }); }
          if (ev.crush) {
            burst(14, "#ffffff", 220);
            spawn({ x: c.x, y: c.y, color: "#ffffff", size: 70, kind: "ring", maxLife: 0.5, life: 0.5 });
          }
          break;
        }
        case "kill":
          burst(12, "#3ddc84", 150);
          break;
        case "bossKill":
          burst(32, "#ffd93d", 260, "shard", 7);
          burst(20, "#b26bff", 200);
          spawn({ x: center().x, y: center().y, color: "#ffd93d", size: 100, kind: "ring", maxLife: 0.7, life: 0.7 });
          break;
        case "bossFail":
          burst(16, "#ff6b6b", 180);
          break;
        default:
          break;
      }
    });
  }, [engine]);

  return <canvas className="combat-particles" ref={ref} aria-hidden="true" />;
}

