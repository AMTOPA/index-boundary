"use client";

import { useEffect, useRef } from "react";
import { useGameSelector, useReducedMotion } from "@/components/common/hooks";

const STAR_COUNT = 64;
const TWINKLE_TIME_SCALE = 0.033 * 24;
const STARFIELD_FRAME_INTERVAL_MS = 1_000 / 24;
// Visual FPS only controls rendering cadence; game logic keeps its own TPS.

export function Starfield({ tint, active = true }: { tint: string; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const animationFps = useGameSelector((state) => state.meta.settings.animationFps ?? 60);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const frameIntervalMs = Math.max(1_000 / animationFps, STARFIELD_FRAME_INTERVAL_MS);
    const dpr = Math.min(reducedMotion ? 1 : 1.25, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    let raf = 0;
    let elapsed = 0;
    let lastFrame = 0;
    let visible = !document.hidden && active;
    let nebula: CanvasGradient | null = null;
    let horizon: CanvasGradient | null = null;

    const stars = Array.from({ length: STAR_COUNT }, (_, index) => ({
      accent: index % 11 === 0,
      x: Math.random(),
      y: Math.random(),
      radius: 0.4 + Math.random() * 1.4,
      twinkle: Math.random() * Math.PI * 2,
      speed: 0.0002 + Math.random() * 0.0009,
    }));

    const render = (dt: number) => {
      if (!reducedMotion) elapsed += dt * TWINKLE_TIME_SCALE;
      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        if (dt > 0 && !reducedMotion) {
          // Preserve the original 24 FPS motion rate while allowing smoother rendering.
          star.y += star.speed * 48 * dt;
          if (star.y > 1.02) {
            star.y = -0.02;
            star.x = Math.random();
          }
        }
        const alpha = reducedMotion
          ? 0.38
          : 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(star.twinkle + elapsed * 2.2));
        context.globalAlpha = Math.max(0, alpha);
        context.fillStyle = star.accent ? tint : "#dfe8ff";
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
        context.fill();
        if (star.radius > 1.35) {
          context.globalAlpha = Math.min(0.45, alpha * 0.62);
          context.fillRect(star.x * width - star.radius * 2.4, star.y * height - 0.35, star.radius * 4.8, 0.7);
          context.fillRect(star.x * width - 0.35, star.y * height - star.radius * 2.4, 0.7, star.radius * 4.8);
        }
      }

      context.globalAlpha = 1;
      if (nebula) {
        context.fillStyle = nebula;
        context.fillRect(0, 0, width, height);
      }
      if (horizon) {
        context.fillStyle = horizon;
        context.fillRect(0, height * 0.52, width, height * 0.48);
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      nebula = context.createRadialGradient(
        width * 0.5,
        height * 0.18,
        0,
        width * 0.5,
        height * 0.18,
        Math.max(width, height) * 0.65,
      );
      nebula.addColorStop(0, `${tint}26`);
      nebula.addColorStop(0.6, `${tint}0d`);
      nebula.addColorStop(1, "transparent");
      horizon = context.createLinearGradient(0, height * 0.52, 0, height);
      horizon.addColorStop(0, "transparent");
      horizon.addColorStop(1, "rgba(3,7,16,0.28)");
      render(0);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || reducedMotion) return;
      if (now - lastFrame >= frameIntervalMs) {
        const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1_000));
        render(dt);
        lastFrame = now;
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || !visible || reducedMotion) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const onVisibilityChange = () => {
      visible = !document.hidden && active;
      if (!visible) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      render(0);
      start();
    };

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [tint, reducedMotion, active, animationFps]);

  return <canvas className="starfield" ref={ref} aria-hidden="true" />;
}
