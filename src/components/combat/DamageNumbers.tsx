"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { Big, toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";
import styles from "./CombatVisuals.module.css";

type DamageVariant = "auto" | "manual" | "crit" | "super" | "crush" | "boss";

interface DamageNumber {
  id: number;
  text: string;
  label?: string;
  variant: DamageVariant;
  x: number;
  y: number;
  duration: number;
}

interface AutoBucket {
  damage: Big;
  hits: number;
  timer: number;
}

const AUTO_WINDOW_MS = 180;
const MAX_VISIBLE = 8;
let nextId = 0;

export function DamageNumbers() {
  const { engine } = useGame();
  const [numbers, setNumbers] = useState<DamageNumber[]>([]);
  const laneRef = useRef(0);

  useEffect(() => {
    if (!engine) return;

    const removalTimers = new Set<number>();
    let autoBucket: AutoBucket | null = null;

    const positionFor = (variant: DamageVariant) => {
      if (variant === "auto") {
        const lane = laneRef.current++ % 2;
        return {
          x: lane === 0 ? 18 + Math.random() * 8 : 74 + Math.random() * 8,
          y: 42 + Math.random() * 15,
        };
      }
      if (variant === "manual") return { x: 50 + (Math.random() - 0.5) * 12, y: 65 + Math.random() * 5 };
      if (variant === "crit") return { x: 30 + Math.random() * 40, y: 34 + Math.random() * 7 };
      if (variant === "super") return { x: 50 + (Math.random() - 0.5) * 18, y: 28 + Math.random() * 5 };
      if (variant === "crush") return { x: 50 + (Math.random() - 0.5) * 10, y: 23 };
      return { x: 50, y: 17 };
    };

    const show = (item: Omit<DamageNumber, "id">) => {
      const number = { ...item, id: ++nextId };
      setNumbers((current) => [...current.slice(-(MAX_VISIBLE - 1)), number]);
      const timer = window.setTimeout(() => {
        removalTimers.delete(timer);
        setNumbers((current) => current.filter((entry) => entry.id !== number.id));
      }, number.duration);
      removalTimers.add(timer);
    };

    const flushAuto = () => {
      const bucket = autoBucket;
      autoBucket = null;
      if (!bucket) return;
      window.clearTimeout(bucket.timer);
      const position = positionFor("auto");
      show({
        text: formatBig(bucket.damage),
        label: bucket.hits > 1 ? `自动 ×${bucket.hits}` : "自动",
        variant: "auto",
        ...position,
        duration: 720,
      });
    };

    const unsubscribe = engine.onEvent((event) => {
      if (event.type === "bossKill") {
        flushAuto();
        show({
          text: "核心终结",
          label: "BOSS BREAK",
          variant: "boss",
          ...positionFor("boss"),
          duration: 1_150,
        });
        return;
      }
      if (event.type !== "hit") return;

      const damage = toBig(event.damage);
      const emphasized = event.isClick || event.superCrit || event.crush;
      if (!emphasized) {
        if (autoBucket) {
          autoBucket.damage = autoBucket.damage.add(damage);
          autoBucket.hits += 1;
        } else {
          autoBucket = {
            damage,
            hits: 1,
            timer: window.setTimeout(flushAuto, AUTO_WINDOW_MS),
          };
        }
        return;
      }

      flushAuto();
      const variant: DamageVariant = event.crush
        ? "crush"
        : event.superCrit
          ? "super"
          : event.crit
            ? "crit"
            : "manual";
      const label = event.crush
        ? "碾压"
        : event.superCrit
          ? "超暴击"
          : event.crit
            ? event.isClick ? "手动暴击" : "暴击"
            : "手动";
      show({
        text: formatBig(damage),
        label,
        variant,
        ...positionFor(variant),
        duration: variant === "crush" ? 1_050 : variant === "super" ? 980 : 850,
      });
    });

    return () => {
      unsubscribe();
      if (autoBucket) window.clearTimeout(autoBucket.timer);
      removalTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [engine]);

  return (
    <div className={styles.damageLayer} aria-hidden="true">
      {numbers.map((number) => (
        <div
          key={number.id}
          className={`${styles.damageNumber} ${styles[number.variant]}`}
          style={{
            left: `${number.x}%`,
            top: `${number.y}%`,
            animationDuration: `${number.duration}ms`,
          }}
          data-impact={number.variant}
        >
          <span className={styles.damageValue}>{number.text}</span>
          {number.label && <span className={styles.damageLabel}>{number.label}</span>}
        </div>
      ))}
    </div>
  );
}
