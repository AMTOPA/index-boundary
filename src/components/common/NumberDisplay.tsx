"use client";
import { Big, toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";

// 接受 Big / [m,e] / number，渲染格式化数字
export function NumberDisplay({ value, className }: { value: Big | [number, number] | number; className?: string }) {
  const b = value instanceof Big ? value : toBig(value as [number, number] | number);
  const formatted = formatBig(b);
  return <span className={`mono number-display ${className ?? ""}`.trim()} data-value={formatted}>{formatted}</span>;
}