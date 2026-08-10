// 天赋系统：分配 / 重置 / Keystone 互斥
import type { GameState, TreeId } from "../types";
import { TALENT_NODES, keystoneOptionsFor, talentNodeById } from "../data/talents";
import { CONFIG } from "../config";

export function allocatedPoints(state: GameState, nodeId: string): number {
  return state.talents.allocations[nodeId] ?? 0;
}

export function canAllocate(state: GameState, nodeId: string): { ok: boolean; reason?: string } {
  const def = talentNodeById(nodeId);
  if (!def) return { ok: false, reason: "未知节点" };
  if (state.talents.points < def.cost) return { ok: false, reason: "天赋点不足" };
  const cur = allocatedPoints(state, nodeId);
  if (cur >= def.max) return { ok: false, reason: "已满级" };

  // Keystone 互斥：同组只能选一个
  if (def.type === "keystone" && def.exclusiveGroup) {
    const chosen = state.talents.keystones[def.tree];
    if (chosen && chosen !== nodeId) return { ok: false, reason: "已选择其他核心天赋" };
  }
  // 前置
  if (def.requires) {
    for (const req of def.requires) {
      const reqDef = talentNodeById(req);
      if (reqDef && allocatedPoints(state, req) < reqDef.max) {
        return { ok: false, reason: "前置天赋未点满" };
      }
    }
  }
  // 非 Keystone 节点，若本树已选 Keystone 则不能继续加（终局节点之后）
  if (def.type !== "keystone") {
    const chosen = state.talents.keystones[def.tree];
    if (chosen) return { ok: false, reason: "已选择核心天赋，本树锁定" };
  }
  return { ok: true };
}

export function allocate(state: GameState, nodeId: string): boolean {
  const check = canAllocate(state, nodeId);
  if (!check.ok) return false;
  const def = talentNodeById(nodeId)!;
  state.talents.allocations[nodeId] = (state.talents.allocations[nodeId] ?? 0) + 1;
  state.talents.points -= def.cost;
  if (def.type === "keystone") {
    state.talents.keystones[def.tree] = nodeId;
  }
  return true;
}

// 重置整棵树（返还点数）
export function resetTree(state: GameState, tree: TreeId): void {
  for (const def of TALENT_NODES) {
    if (def.tree !== tree) continue;
    const pts = state.talents.allocations[def.id] ?? 0;
    if (pts > 0) {
      state.talents.points += pts * def.cost;
      delete state.talents.allocations[def.id];
    }
  }
  delete state.talents.keystones[tree];
}

export function keystoneOf(state: GameState, tree: TreeId): string | undefined {
  return state.talents.keystones[tree];
}

export function keystoneOptions(tree: TreeId): string[] {
  return keystoneOptionsFor(tree).map((n) => n.id);
}

export function canConvertOverflow(state: GameState): boolean {
  if (state.talents.points < CONFIG.TALENT_OVERFLOW.CHUNK) return false;
  // 只要还有任意节点可分配，就不算溢出（避免玩家在可加点时误转化）
  for (const def of TALENT_NODES) {
    if (canAllocate(state, def.id).ok) return false;
  }
  return true;
}

// 转化一个 CHUNK，返回新增残辉数（0 表示不可转化）
export function convertOverflow(state: GameState): number {
  if (!canConvertOverflow(state)) return 0;
  state.talents.points -= CONFIG.TALENT_OVERFLOW.CHUNK;
  state.talents.residue = (state.talents.residue ?? 0) + 1;
  return 1;
}
