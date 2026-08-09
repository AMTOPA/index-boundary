import { CONFIG } from "../config";
import type { SkillId } from "../types";

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
};

export const SKILL_IDS: SkillId[] = ["overclock", "critical_strike", "gold_collapse", "singularity_cannon"];

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