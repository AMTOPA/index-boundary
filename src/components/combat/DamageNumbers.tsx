"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { formatBig } from "@/game/format";
import { toBig } from "@/game/bignum";

interface Num {
  id: number;
  text: string;
  crit: boolean;
  superCrit: boolean;
  crush: boolean;
  x: number;
  y: number;
}

let nid = 0;

export function DamageNumbers() {
  const { engine } = useGame();
  const [nums, setNums] = useState<Num[]>([]);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine) return;
    return engine.onEvent((ev) => {
      if (ev.type !== "hit") return;
      const layer = layerRef.current;
      if (!layer) return;
      const rect = layer.getBoundingClientRect();
      const spread = Math.max(40, rect.width - 72);
      const x = Math.min(Math.max(18, 30 + Math.random() * spread), Math.max(18, rect.width - 52));
      const y = Math.max(30, 40 + Math.random() * (rect.height * 0.4));
      const damage = toBig(ev.damage);
      const text = formatBig(damage);
      const item: Num = {
        id: ++nid,
        text,
        crit: ev.crit,
        superCrit: ev.superCrit,
        crush: ev.crush,
        x,
        y,
      };
      setNums((list) => [...list.slice(-CONFIG_MAX()), item]);
      window.setTimeout(() => {
        setNums((list) => list.filter((n) => n.id !== item.id));
      }, 950);
    });
  }, [engine]);

  return (
    <div className="dmg-layer" ref={layerRef}>
      {nums.map((n) => (
        <div
          key={n.id}
          className={`dmg ${n.crit ? "crit" : ""} ${n.superCrit ? "super" : ""} ${n.crush ? "crush" : ""}`}
          style={{ left: n.x, top: n.y }}
          data-impact={n.crush ? "crush" : n.superCrit ? "super" : n.crit ? "crit" : "normal"}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}

const CONFIG_MAX = () => 30;