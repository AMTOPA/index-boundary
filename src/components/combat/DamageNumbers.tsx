"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { Big, toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";
import styles from "./CombatVisuals.module.css";

type DamageVariant = "auto" | "manual" | "crit" | "super" | "crush" | "boss";
type BucketKind = "auto" | "crit" | "manualCrit";

interface DamageNumber {
  id: number;
  text: string;
  label?: string;
  variant: DamageVariant;
  x: number;
  y: number;
  duration: number;
}

interface DamageBucket {
  damage: Big;
  hits: number;
  timer: number;
}

const AGGREGATION_WINDOW_MS = 280;
const MAX_VISIBLE = 5;
const BOSS_DURATION_MS = 860;
const LANES: Record<DamageVariant, ReadonlyArray<Readonly<{ x: number; y: number }>>> = {
  auto: [{ x: 25, y: 50 }, { x: 75, y: 51 }, { x: 28, y: 62 }, { x: 72, y: 63 }],
  manual: [{ x: 43, y: 68 }, { x: 57, y: 68 }],
  crit: [{ x: 35, y: 38 }, { x: 50, y: 35 }, { x: 65, y: 38 }],
  super: [{ x: 42, y: 29 }, { x: 58, y: 29 }],
  crush: [{ x: 50, y: 24 }],
  boss: [{ x: 50, y: 10 }],
};
const VARIANT_PRIORITY: Record<DamageVariant, number> = {
  auto: 0,
  manual: 1,
  crit: 2,
  super: 3,
  crush: 4,
  boss: 5,
};
let nextId = 0;

export function DamageNumbers() {
  const { engine } = useGame();
  const [numbers, setNumbers] = useState<DamageNumber[]>([]);

  useEffect(() => {
    if (!engine) {
      setNumbers([]);
      return;
    }

    const removalTimers = new Map<number, number>();
    const buckets = new Map<BucketKind, DamageBucket>();
    const laneCounters: Record<DamageVariant, number> = { auto: 0, manual: 0, crit: 0, super: 0, crush: 0, boss: 0 };
    let bossActiveUntil = 0;

    const cancelRemoval = (id: number) => {
      const timer = removalTimers.get(id);
      if (timer === undefined) return;
      window.clearTimeout(timer);
      removalTimers.delete(id);
    };

    const positionFor = (variant: DamageVariant) => {
      const lanes = LANES[variant];
      const position = lanes[laneCounters[variant] % lanes.length];
      laneCounters[variant] += 1;
      return position;
    };

    const show = (item: Omit<DamageNumber, "id">) => {
      const number = { ...item, id: ++nextId };
      setNumbers((current) => {
        const next = item.variant === "boss"
          ? current.filter((entry) => entry.variant === "auto" && entry.y >= 45)
          : current;
        if (item.variant === "boss") {
          current.forEach((entry) => {
            if (!next.some((kept) => kept.id === entry.id)) cancelRemoval(entry.id);
          });
        }
        const visible = next.length < MAX_VISIBLE ? next : [...next].sort((a, b) => VARIANT_PRIORITY[a.variant] - VARIANT_PRIORITY[b.variant]);
        const evicted = next.length >= MAX_VISIBLE ? visible[0] : undefined;
        if (evicted && VARIANT_PRIORITY[number.variant] < VARIANT_PRIORITY[evicted.variant]) return current;
        if (evicted) cancelRemoval(evicted.id);
        return evicted
          ? [...next.filter((entry) => entry.id !== evicted.id), number]
          : [...next, number];
      });

      const timer = window.setTimeout(() => {
        removalTimers.delete(number.id);
        setNumbers((current) => current.filter((entry) => entry.id !== number.id));
      }, number.duration);
      removalTimers.set(number.id, timer);
    };

    const flushBucket = (kind: BucketKind) => {
      const bucket = buckets.get(kind);
      if (!bucket) return;
      buckets.delete(kind);
      window.clearTimeout(bucket.timer);
      const variant: DamageVariant = kind === "auto" ? "auto" : "crit";
      const baseLabel = kind === "auto" ? "\u81ea\u52a8" : kind === "manualCrit" ? "\u624b\u52a8\u66b4\u51fb" : "\u66b4\u51fb";
      show({
        text: formatBig(bucket.damage),
        label: bucket.hits > 1 ? `${baseLabel} ×${bucket.hits}` : baseLabel,
        variant,
        ...positionFor(variant),
        duration: variant === "crit" ? 900 : 760,
      });
    };

    const addToBucket = (kind: BucketKind, damage: Big) => {
      const bucket = buckets.get(kind);
      if (bucket) {
        bucket.damage = bucket.damage.add(damage);
        bucket.hits += 1;
        return;
      }
      buckets.set(kind, {
        damage,
        hits: 1,
        timer: window.setTimeout(() => flushBucket(kind), AGGREGATION_WINDOW_MS),
      });
    };

    const flushBuckets = () => {
      (["auto", "crit", "manualCrit"] as const).forEach(flushBucket);
    };

    const unsubscribe = engine.onEvent((event) => {
      if (event.type === "bossKill") {
        flushBuckets();
        bossActiveUntil = performance.now() + BOSS_DURATION_MS;
        show({ text: "\u6838\u5fc3\u7ec8\u7ed3", label: "BOSS BREAK", variant: "boss", ...positionFor("boss"), duration: BOSS_DURATION_MS });
        return;
      }
      if (event.type !== "hit") return;

      const damage = toBig(event.damage);
      const now = performance.now();
      // Keep the boss-finish banner as the only focus during its short display.
      if (now < bossActiveUntil) return;
      if (event.crush || event.superCrit) {
        const variant: DamageVariant = event.crush ? "crush" : "super";
        show({ text: formatBig(damage), label: event.crush ? "\u78be\u538b" : "\u8d85\u66b4\u51fb", variant, ...positionFor(variant), duration: event.crush ? 1_050 : 980 });
        return;
      }
      if (event.crit) {
        addToBucket(event.isClick ? "manualCrit" : "crit", damage);
        return;
      }
      if (!event.isClick) {
        addToBucket("auto", damage);
        return;
      }
      show({ text: formatBig(damage), label: "\u624b\u52a8", variant: "manual", ...positionFor("manual"), duration: 850 });
    });

    return () => {
      unsubscribe();
      buckets.forEach((bucket) => window.clearTimeout(bucket.timer));
      removalTimers.forEach((timer) => window.clearTimeout(timer));
      removalTimers.clear();
      setNumbers([]);
    };
  }, [engine]);

  return (
    <div className={styles.damageLayer} aria-hidden="true">
      {numbers.map((number) => (
        <div key={number.id} className={`${styles.damageNumber} ${styles[number.variant]}`} style={{ left: `${number.x}%`, top: `${number.y}%`, animationDuration: `${number.duration}ms` }} data-impact={number.variant}>
          <span className={styles.damageValue}>{number.text}</span>
          {number.label && <span className={styles.damageLabel}>{number.label}</span>}
        </div>
      ))}
    </div>
  );
}
