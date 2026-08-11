"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useReducedMotion } from "@/components/common/hooks";
import styles from "./CombatVisuals.module.css";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: "spark" | "ring" | "shard";
}

const MAX_PARTICLES = 80;
const FRAME_INTERVAL_MS = 1_000 / 30;

export function CombatParticles() {
  const { engine } = useGame();
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const particles: Particle[] = [];
    let visible = !document.hidden;
    let raf = 0;
    let lastFrame = performance.now();
    let width = 1;
    let height = 1;
    let lastAmbientSpark = 0;
    let lastCritBurst = 0;

    const resize = () => {
      const rect = (canvas.parentElement ?? canvas).getBoundingClientRect();
      const dpr = Math.min(reducedMotion ? 1 : 1.35, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const clear = () => {
      context.clearRect(0, 0, width, height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    };

    const drawParticle = (particle: Particle) => {
      const progress = Math.max(0, particle.life / particle.maxLife);
      context.globalAlpha = progress;
      context.strokeStyle = particle.color;
      context.fillStyle = particle.color;

      if (particle.kind === "ring") {
        context.lineWidth = Math.max(1, 3 * progress);
        context.beginPath();
        context.arc(particle.x, particle.y, reducedMotion ? particle.size : particle.size * (1.65 - progress), 0, Math.PI * 2);
        context.stroke();
        return;
      }
      if (particle.kind === "shard") {
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.vx * 0.012 + particle.life * 4);
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        context.restore();
        return;
      }

      context.lineWidth = Math.max(1, particle.size * progress);
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.lineTo(particle.x - particle.vx * 0.035, particle.y - particle.vy * 0.035);
      context.stroke();
      context.beginPath();
      context.arc(particle.x, particle.y, Math.max(0.8, particle.size * progress * 0.65), 0, Math.PI * 2);
      context.fill();
    };

    const tick = (now: number) => {
      raf = 0;
      if (!visible) return;
      if (now - lastFrame < FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1_000));
      lastFrame = now;
      clear();
      context.globalCompositeOperation = "lighter";

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life -= dt;
        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= reducedMotion ? 0.8 : 0.955;
        particle.vy *= reducedMotion ? 0.8 : 0.955;
        drawParticle(particle);
      }

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      if (particles.length > 0) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (raf || !visible || particles.length === 0) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const spawn = (particle: Particle) => {
      if (!visible) return;
      if (reducedMotion) {
        particle.vx = 0;
        particle.vy = 0;
        particle.life = Math.min(particle.life, 0.18);
        particle.maxLife = Math.min(particle.maxLife, 0.18);
      }
      particles.push(particle);
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
      start();
    };

    const center = () => ({ x: width / 2, y: height * 0.43 });
    const burst = (
      count: number,
      color: string,
      speed: number,
      kind: Particle["kind"] = "spark",
      size = 4,
    ) => {
      const origin = center();
      const actualCount = reducedMotion ? Math.min(3, Math.ceil(count / 8)) : Math.min(count, 20);
      for (let index = 0; index < actualCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.45 + Math.random() * 0.7);
        const life = 0.38 + Math.random() * 0.42;
        spawn({
          x: origin.x + (Math.random() - 0.5) * 38,
          y: origin.y + (Math.random() - 0.5) * 28,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity - 18,
          color,
          size: size * (0.65 + Math.random() * 0.7),
          kind: reducedMotion && kind === "shard" ? "ring" : kind,
          maxLife: life,
          life,
        });
      }
    };

    const spawnRing = (color: string, size: number, life: number) => {
      const origin = center();
      spawn({
        ...origin,
        vx: 0,
        vy: 0,
        color,
        size,
        kind: "ring",
        maxLife: life,
        life,
      });
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement ?? canvas);

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (!visible) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const unsubscribe = engine.onEvent((event) => {
      if (!visible) return;
      switch (event.type) {
        case "hit": {
          const now = performance.now();
          const origin = center();
          if (event.isClick || event.crit || event.superCrit || event.crush || now - lastAmbientSpark > 160) {
            lastAmbientSpark = now;
            spawn({
              x: origin.x + (Math.random() - 0.5) * 42,
              y: origin.y + (Math.random() - 0.5) * 34,
              vx: (Math.random() - 0.5) * 45,
              vy: -35,
              color: event.isClick ? "#8eeaff" : "#dfe8ff",
              size: event.isClick ? 4 : 2.5,
              kind: "spark",
              maxLife: 0.28,
              life: 0.28,
            });
          }
          if (event.crush) {
            burst(14, "#ffffff", 210);
            spawnRing("#ffffff", 68, 0.48);
          } else if (event.superCrit) {
            burst(14, "#b26bff", 175, "shard", 6);
            spawnRing("#b26bff", 42, 0.42);
          } else if (event.crit && (event.isClick || now - lastCritBurst > 100)) {
            lastCritBurst = now;
            burst(event.isClick ? 8 : 5, "#ffb52e", 125);
          }
          break;
        }
        case "kill":
          burst(event.boss ? 8 : 10, "#3ddc84", 135);
          break;
        case "bossKill":
          burst(26, "#ffd93d", 235, "shard", 7);
          burst(14, "#b26bff", 185);
          spawnRing("#ffd93d", 98, 0.68);
          break;
        case "bossFail":
          burst(12, "#ff6b6b", 165);
          spawnRing("#ff6b6b", 72, 0.5);
          break;
        default:
          break;
      }
    });

    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
      particles.length = 0;
      clear();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [engine, reducedMotion]);

  return <canvas className={`${styles.particleCanvas} combat-particles`} ref={canvasRef} aria-hidden="true" />;
}
