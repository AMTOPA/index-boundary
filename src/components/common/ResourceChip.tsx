"use client";
import type { Big } from "@/game/bignum";
import { NumberDisplay } from "@/components/common/NumberDisplay";

type ChipTone = "frag" | "gold" | "core" | "energy" | "world" | "law";

// 通用资源 chip：图标 + 渐变数字 + 轻微 shimmer（纯 CSS，无第三方依赖）
export function ResourceChip({
  icon,
  label,
  value,
  tone = "frag",
  className = "",
}: {
  icon: string;
  label?: string;
  value: Big | [number, number] | number;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span className={`resource-chip tone-${tone} ${className}`.trim()}>
      <span className="rc-icon" aria-hidden="true">{icon}</span>
      <span className="rc-body">
        {label ? <span className="rc-label">{label}</span> : null}
        <NumberDisplay className="rc-value" value={value} />
      </span>
    </span>
  );
}