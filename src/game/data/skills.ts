import { CONFIG } from "../config";
import type { PassiveId, SkillId } from "../types";

export interface SkillDef {
  id: SkillId;
  name: string;
  desc: string;
  icon: string;
  color: string;
  cooldown: number;
  duration: number;
  // 等级效果
  baseEffect: number;
  effectPerLevel: number;
  effectCap?: number;
  cdReducePerLevel: number;
  // 特殊机制（非倍率类）
  empFreezeSec?: number; // 电磁脉冲：Boss 剩余时间 +秒
  comboDmgMult?: number; // 过载连击：连击伤害倍率
  goldMultWhileActive?: number; // 终焉协议：活跃期金币倍率
  aspdMultWhileActive?: number; // 终焉协议：活跃期攻速倍率
}

const S = CONFIG.SKILLS;

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  overclock: {
    id: "overclock",
    name: S.overclock.name,
    desc: S.overclock.desc,
    icon: "⚡",
    color: "#ffe14d",
    cooldown: S.overclock.cooldown,
    duration: S.overclock.duration,
    baseEffect: 5,
    effectPerLevel: S.overclock.levelEffect.multPerLevel,
    effectCap: S.overclock.levelEffect.multCap,
    cdReducePerLevel: S.overclock.levelEffect.cdReducePerLevel,
  },
  critical_strike: {
    id: "critical_strike",
    name: S.critical_strike.name,
    desc: S.critical_strike.desc,
    icon: "💥",
    color: "#ff6b6b",
    cooldown: S.critical_strike.cooldown,
    duration: 0,
    baseEffect: 100,
    effectPerLevel: S.critical_strike.levelEffect.multPerLevel,
    cdReducePerLevel: S.critical_strike.levelEffect.cdReducePerLevel,
  },
  gold_collapse: {
    id: "gold_collapse",
    name: S.gold_collapse.name,
    desc: S.gold_collapse.desc,
    icon: "💰",
    color: "#ffd93d",
    cooldown: S.gold_collapse.cooldown,
    duration: S.gold_collapse.duration,
    baseEffect: 10,
    effectPerLevel: S.gold_collapse.levelEffect.multPerLevel,
    effectCap: S.gold_collapse.levelEffect.multCap,
    cdReducePerLevel: S.gold_collapse.levelEffect.cdReducePerLevel,
  },
  singularity_cannon: {
    id: "singularity_cannon",
    name: S.singularity_cannon.name,
    desc: S.singularity_cannon.desc,
    icon: "🌌",
    color: "#b26bff",
    cooldown: S.singularity_cannon.cooldown,
    duration: 0,
    baseEffect: 300,
    effectPerLevel: S.singularity_cannon.levelEffect.multPerLevel,
    cdReducePerLevel: S.singularity_cannon.levelEffect.cdReducePerLevel,
  },
  emp_burst: {
    id: "emp_burst",
    name: S.emp_burst.name,
    desc: S.emp_burst.desc,
    icon: "⚡",
    color: "#4da3ff",
    cooldown: S.emp_burst.cooldown,
    duration: S.emp_burst.duration,
    baseEffect: 60,
    effectPerLevel: S.emp_burst.levelEffect.multPerLevel,
    empFreezeSec: S.emp_burst.empFreezeSec,
    cdReducePerLevel: S.emp_burst.levelEffect.cdReducePerLevel,
  },
  time_freeze: {
    id: "time_freeze",
    name: S.time_freeze.name,
    desc: S.time_freeze.desc,
    icon: "❄️",
    color: "#7fe7ff",
    cooldown: S.time_freeze.cooldown,
    duration: S.time_freeze.duration,
    baseEffect: 1.5,
    effectPerLevel: S.time_freeze.levelEffect.multPerLevel,
    effectCap: S.time_freeze.levelEffect.multCap,
    cdReducePerLevel: S.time_freeze.levelEffect.cdReducePerLevel,
  },
  overload_combo: {
    id: "overload_combo",
    name: S.overload_combo.name,
    desc: S.overload_combo.desc,
    icon: "🔥",
    color: "#ff8c42",
    cooldown: S.overload_combo.cooldown,
    duration: S.overload_combo.duration,
    baseEffect: 40,
    effectPerLevel: S.overload_combo.levelEffect.multPerLevel,
    effectCap: S.overload_combo.levelEffect.multCap,
    comboDmgMult: S.overload_combo.comboDmgMult,
    cdReducePerLevel: S.overload_combo.levelEffect.cdReducePerLevel,
  },
  data_flood: {
    id: "data_flood",
    name: S.data_flood.name,
    desc: S.data_flood.desc,
    icon: "📥",
    color: "#ffd93d",
    cooldown: S.data_flood.cooldown,
    duration: S.data_flood.duration,
    baseEffect: 300,
    effectPerLevel: S.data_flood.levelEffect.multPerLevel,
    cdReducePerLevel: S.data_flood.levelEffect.cdReducePerLevel,
  },
  charged_hit: {
    id: "charged_hit",
    name: S.charged_hit.name,
    desc: S.charged_hit.desc,
    icon: "🎯",
    color: "#ff6b6b",
    cooldown: S.charged_hit.cooldown,
    duration: S.charged_hit.duration,
    baseEffect: 250,
    effectPerLevel: S.charged_hit.levelEffect.multPerLevel,
    cdReducePerLevel: S.charged_hit.levelEffect.cdReducePerLevel,
  },
  split_matrix: {
    id: "split_matrix",
    name: S.split_matrix.name,
    desc: S.split_matrix.desc,
    icon: "🪞",
    color: "#7aff6e",
    cooldown: S.split_matrix.cooldown,
    duration: S.split_matrix.duration,
    baseEffect: 0.3,
    effectPerLevel: S.split_matrix.levelEffect.multPerLevel,
    effectCap: S.split_matrix.levelEffect.multCap,
    cdReducePerLevel: S.split_matrix.levelEffect.cdReducePerLevel,
  },
  quantum_replay: {
    id: "quantum_replay",
    name: S.quantum_replay.name,
    desc: S.quantum_replay.desc,
    icon: "🔄",
    color: "#b26bff",
    cooldown: S.quantum_replay.cooldown,
    duration: S.quantum_replay.duration,
    baseEffect: 25,
    effectPerLevel: S.quantum_replay.levelEffect.multPerLevel,
    cdReducePerLevel: S.quantum_replay.levelEffect.cdReducePerLevel,
  },
  final_protocol: {
    id: "final_protocol",
    name: S.final_protocol.name,
    desc: S.final_protocol.desc,
    icon: "☠️",
    color: "#ff4757",
    cooldown: S.final_protocol.cooldown,
    duration: S.final_protocol.duration,
    baseEffect: 3,
    effectPerLevel: S.final_protocol.levelEffect.multPerLevel,
    effectCap: S.final_protocol.levelEffect.multCap,
    goldMultWhileActive: S.final_protocol.goldMultWhileActive,
    aspdMultWhileActive: S.final_protocol.aspdMultWhileActive,
    cdReducePerLevel: S.final_protocol.levelEffect.cdReducePerLevel,
  },
};

export const SKILL_IDS: SkillId[] = ["overclock", "critical_strike", "gold_collapse", "singularity_cannon", "emp_burst", "time_freeze", "overload_combo", "data_flood", "charged_hit", "split_matrix", "quantum_replay", "final_protocol"];

export function skillEffect(def: SkillDef, level: number): number {
  let eff = def.baseEffect + def.effectPerLevel * (level - 1);
  if (def.effectCap !== undefined && eff > def.effectCap) eff = def.effectCap;
  return eff;
}

export function skillCooldown(def: SkillDef, level: number): number {
  const cd = def.cooldown - def.cdReducePerLevel * (level - 1);
  return Math.max(5, cd);
}

export function skillCoreCost(currentLevel: number): number {
  const costs = CONFIG.SKILL_CORE_COSTS;
  if (currentLevel <= 0) return costs[0];
  const idx = Math.min(currentLevel, costs.length - 1);
  return costs[idx];
}
// ---------------- 被动技能 ----------------
export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string;
  icon: string;
  kind: "aspd" | "critChance" | "gold";
  effectPerLevel: number;
}

const P = CONFIG.SKILL_PASSIVES;

export const PASSIVE_DEFS: Record<PassiveId, PassiveDef> = {
  rhythm: { id: "rhythm", name: P.rhythm.name, desc: P.rhythm.desc, icon: P.rhythm.icon, kind: P.rhythm.kind, effectPerLevel: P.rhythm.effectPerLevel },
  focus: { id: "focus", name: P.focus.name, desc: P.focus.desc, icon: P.focus.icon, kind: P.focus.kind, effectPerLevel: P.focus.effectPerLevel },
  greed: { id: "greed", name: P.greed.name, desc: P.greed.desc, icon: P.greed.icon, kind: P.greed.kind, effectPerLevel: P.greed.effectPerLevel },
};

export const PASSIVE_IDS: PassiveId[] = ["rhythm", "focus", "greed"];

export function passiveEffect(def: PassiveDef, level: number): number {
  return def.effectPerLevel * level;
}

export function passiveCoreCost(currentLevel: number): number {
  const costs = CONFIG.SKILL_CORE_COSTS;
  if (currentLevel <= 0) return costs[0];
  const idx = Math.min(currentLevel, costs.length - 1);
  return costs[idx];
}