// 技能系统：释放 / 冷却 / 升级
import { Big } from "../bignum";
import type { GameState, SkillId } from "../types";
import { SKILL_DEFS, skillCooldown, skillCoreCost } from "../data/skills";

// 释放结果：engine 需要据 action 处理临界打击/奇点炮
export type CastAction =
  | { kind: "none" }
  | { kind: "critical_strike"; mult: number }
  | { kind: "singularity_cannon"; mult: number };

export function castSkill(state: GameState, id: SkillId, timeSec: number): { ok: boolean; reason?: string; action: CastAction } {
  const inst = state.skills.actives.find((s) => s.id === id);
  if (!inst) return { ok: false, reason: "未解锁", action: { kind: "none" } };
  if (inst.cdRemaining > 0) return { ok: false, reason: "冷却中", action: { kind: "none" } };
  const def = SKILL_DEFS[id];
  inst.cdRemaining = skillCooldown(def, inst.level);
  if (def.duration > 0) {
    inst.active = true;
    inst.activeUntil = timeSec + def.duration;
  }
  if (id === "critical_strike") {
    return { ok: true, action: { kind: "critical_strike", mult: 100 + def.effectPerLevel * (inst.level - 1) } };
  }
  if (id === "singularity_cannon") {
    return { ok: true, action: { kind: "singularity_cannon", mult: def.baseEffect + def.effectPerLevel * (inst.level - 1) } };
  }
  return { ok: true, action: { kind: "none" } };
}

export function tickSkills(state: GameState, dt: number, timeSec: number): void {
  for (const inst of state.skills.actives) {
    if (inst.cdRemaining > 0) inst.cdRemaining = Math.max(0, inst.cdRemaining - dt);
    // 持续技能到期：复位 active 标志（buff 状态以 activeUntil 为准）
    if (inst.active && inst.activeUntil > 0 && inst.activeUntil <= timeSec) {
      inst.active = false;
    }
  }
}

export function canUpgradeSkill(state: GameState, id: SkillId): boolean {
  const inst = state.skills.actives.find((s) => s.id === id);
  if (!inst) return false;
  const cost = skillCoreCost(inst.level);
  return Big.fromTuple(state.skills.cores).gte(Big.fromNumber(cost));
}

export function upgradeSkill(state: GameState, id: SkillId): boolean {
  const inst = state.skills.actives.find((s) => s.id === id);
  if (!inst || !canUpgradeSkill(state, id)) return false;
  const cost = skillCoreCost(inst.level);
  state.skills.cores = Big.fromTuple(state.skills.cores).sub(Big.fromNumber(cost)).toTuple();
  inst.level += 1;
  return true;
}