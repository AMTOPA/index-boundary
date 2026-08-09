import type { TreeId } from "../types";

export type KeystoneKey =
  | "absoluteDestruction"
  | "critAgain"
  | "aspdOverflowDmg"
  | "perpetualProtocol"
  | "offlineLord"
  | "smartBuy";

export type TalentEffect =
  | { kind: "addPool"; stat: "atkPct" | "goldPct"; perPoint: number }
  | { kind: "critDmgFlat"; perPoint: number }
  | { kind: "mult"; target: "global" | "bossDmg" | "skillDmg"; perPoint: number }
  | { kind: "aspdPct"; perPoint: number }
  | { kind: "offlineEff"; perPoint: number }
  | { kind: "skipBase"; perPoint: number }
  | { kind: "unlock"; key: string }
  | { kind: "keystone"; key: KeystoneKey };

export interface TalentNodeDef {
  id: string;
  tree: TreeId;
  name: string;
  desc: string;
  max: number;
  cost: number;
  type: "additive" | "mult" | "keystone";
  effect: TalentEffect;
  requires?: string[];
  exclusiveGroup?: string;
  tier: number;
}

export const TALENT_TREES: Record<TreeId, { name: string; desc: string }> = {
  destruction: { name: "毁灭", desc: "极限伤害" },
  automation: { name: "自动化", desc: "放置与效率" },
};

export const TALENT_NODES: TalentNodeDef[] = [
  // ===== 毁灭树 =====
  { id: "dest_sharp", tree: "destruction", name: "锋锐", desc: "攻击 +20%/点", max: 5, cost: 1, type: "additive", tier: 1, effect: { kind: "addPool", stat: "atkPct", perPoint: 0.2 } },
  { id: "dest_crit", tree: "destruction", name: "临界", desc: "暴击伤害 +50%/点", max: 3, cost: 1, type: "additive", tier: 1, effect: { kind: "critDmgFlat", perPoint: 0.5 } },
  { id: "dest_super", tree: "destruction", name: "超暴击", desc: "暴击率每超 100% 时伤害 ×1.25/点", max: 3, cost: 2, type: "mult", tier: 2, requires: ["dest_sharp"], effect: { kind: "mult", target: "global", perPoint: 0.25 } },
  { id: "dest_hunter", tree: "destruction", name: "猎手", desc: "Boss 伤害 ×2", max: 1, cost: 2, type: "mult", tier: 2, requires: ["dest_crit"], effect: { kind: "mult", target: "bossDmg", perPoint: 1 } },
  { id: "dest_keystone_absolute", tree: "destruction", name: "绝对破坏", desc: "所有独立乘区最终 ×1.5", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["dest_super", "dest_hunter"], exclusiveGroup: "destruction_keystone", effect: { kind: "keystone", key: "absoluteDestruction" } },
  { id: "dest_keystone_critagain", tree: "destruction", name: "暴击再暴击", desc: "多重暴击层数 +1", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["dest_super", "dest_hunter"], exclusiveGroup: "destruction_keystone", effect: { kind: "keystone", key: "critAgain" } },
  { id: "dest_keystone_aspd", tree: "destruction", name: "攻速溢转", desc: "攻速溢出部分转为独立伤害倍率", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["dest_super", "dest_hunter"], exclusiveGroup: "destruction_keystone", effect: { kind: "keystone", key: "aspdOverflowDmg" } },

  // ===== 自动化树 =====
  { id: "auto_beat", tree: "automation", name: "机械节拍", desc: "自动攻速 +10%/点", max: 2, cost: 1, type: "mult", tier: 1, effect: { kind: "aspdPct", perPoint: 0.1 } },
  { id: "auto_offline", tree: "automation", name: "后台运算", desc: "离线效率 +15%/点（上限 100%）", max: 3, cost: 1, type: "additive", tier: 1, effect: { kind: "offlineEff", perPoint: 0.15 } },
  { id: "auto_break", tree: "automation", name: "自动分解", desc: "解锁自动分解装备", max: 1, cost: 1, type: "additive", tier: 2, requires: ["auto_beat"], effect: { kind: "unlock", key: "auto_breakdown" } },
  { id: "auto_skip", tree: "automation", name: "极速推进", desc: "跳关基数 +10/点", max: 3, cost: 1, type: "additive", tier: 2, requires: ["auto_offline"], effect: { kind: "skipBase", perPoint: 10 } },
  { id: "auto_keystone_perpetual", tree: "automation", name: "永动协议", desc: "每 1 有效攻速 → 独立伤害 ×1.02", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["auto_break", "auto_skip"], exclusiveGroup: "automation_keystone", effect: { kind: "keystone", key: "perpetualProtocol" } },
  { id: "auto_keystone_offline", tree: "automation", name: "离线霸主", desc: "离线效率 100% + 上限 24 小时", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["auto_break", "auto_skip"], exclusiveGroup: "automation_keystone", effect: { kind: "keystone", key: "offlineLord" } },
  { id: "auto_keystone_smart", tree: "automation", name: "智能购买", desc: "解锁 Smart Buy 自动购买", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["auto_break", "auto_skip"], exclusiveGroup: "automation_keystone", effect: { kind: "keystone", key: "smartBuy" } },
];

export function talentNodeById(id: string): TalentNodeDef | undefined {
  return TALENT_NODES.find((n) => n.id === id);
}

export function keystoneOptionsFor(tree: TreeId): TalentNodeDef[] {
  return TALENT_NODES.filter((n) => n.tree === tree && n.type === "keystone");
}

export function treePoints(talents: { allocations: Record<string, number> }, tree: TreeId): number {
  let sum = 0;
  for (const [id, pts] of Object.entries(talents.allocations)) {
    const def = talentNodeById(id);
    if (def && def.tree === tree) sum += pts;
  }
  return sum;
}