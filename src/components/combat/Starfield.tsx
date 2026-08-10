"use client";
// 动态星空背景：漂移星尘 + 随世界色调变化的星云（Canvas，零依赖）
import { useEffect, useRef } from "react";

export function Starfield({ tint }: { tint: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    let raf = 0;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const stars = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.4,
      tw: Math.random() * Math.PI * 2,
      sp: 0.0002 + Math.random() * 0.0009,
    }));
    let t = 0;

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.y += s.sp;
        if (s.y > 1.02) { s.y = -0.02; s.x = Math.random(); }
        const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(s.tw + t * 2.2));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = "#dfe8ff";
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 星云色调（低透明度，跟随世界色）
      const g = ctx.createRadialGradient(W * 0.5, H * 0.18, 0, W * 0.5, H * 0.18, Math.max(W, H) * 0.65);
      g.addColorStop(0, `${tint}26`);
      g.addColorStop(0.6, `${tint}0d`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [tint]);

  return <canvas className="starfield" ref={ref} aria-hidden="true" />;
}