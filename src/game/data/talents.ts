import type { TreeId } from "../types";

export type KeystoneKey =
  | "absoluteDestruction"
  | "critAgain"
  | "aspdOverflowDmg"
  | "perpetualProtocol"
  | "offlineLord"
  | "smartBuy"
  | "compoundInterest"
  | "preciseCraft"
  | "bossGamble"
  | "goldGravity";

export type TalentEffect =
  | { kind: "addPool"; stat: "atkPct" | "goldPct"; perPoint: number }
  | { kind: "critDmgFlat"; perPoint: number }
  | { kind: "mult"; target: "global" | "bossDmg" | "skillDmg"; perPoint: number }
  | { kind: "aspdPct"; perPoint: number }
  | { kind: "offlineEff"; perPoint: number }
  | { kind: "skipBase"; perPoint: number }
  | { kind: "dropRate"; perPoint: number }
  | { kind: "overflowEff"; perPoint: number }
  | { kind: "shardGain"; perPoint: number }
  | { kind: "reforgeCostMult"; perPoint: number }
  | { kind: "craftCostMult"; perPoint: number }
  | { kind: "hpGrowthReduction"; perPoint: number }
  | { kind: "apsCap"; perPoint: number }
  | { kind: "skillCdPct"; perPoint: number }
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
  greed: { name: "贪婪", desc: "财富与资源" },
  singularity: { name: "奇点", desc: "改写法则" },
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

  // ===== 贪婪树 =====
  { id: "greed_loot", tree: "greed", name: "掠夺", desc: "金币 +25%/点", max: 4, cost: 1, type: "additive", tier: 1, effect: { kind: "addPool", stat: "goldPct", perPoint: 0.25 } },
  { id: "greed_luck", tree: "greed", name: "幸运", desc: "装备掉率 +10%/点", max: 4, cost: 1, type: "additive", tier: 1, effect: { kind: "dropRate", perPoint: 0.1 } },
  { id: "greed_pan", tree: "greed", name: "淘金", desc: "溢出效率 +20%/点", max: 3, cost: 2, type: "mult", tier: 2, requires: ["greed_loot"], effect: { kind: "overflowEff", perPoint: 0.2 } },
  { id: "greed_refine", tree: "greed", name: "精炼", desc: "分解碎片 +25%/点", max: 3, cost: 2, type: "additive", tier: 2, requires: ["greed_luck"], effect: { kind: "shardGain", perPoint: 0.25 } },
  { id: "greed_keystone_compound", tree: "greed", name: "指数复利", desc: "累计金币每高 10 倍 → 伤害 +5%", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["greed_pan", "greed_refine"], exclusiveGroup: "greed_keystone", effect: { kind: "keystone", key: "compoundInterest" } },
  { id: "greed_keystone_craft", tree: "greed", name: "精密制造", desc: "重铸 -50% 与制作 -30% 费用", max: 1, cost: 3, type: "keystone", tier: 3, requires: ["greed_pan", "greed_refine"], exclusiveGroup: "greed_keystone", effect: { kind: "keystone", key: "preciseCraft" } },

{ id: "sing_law", tree: "singularity", name: "法则扭曲", desc: "怪物 HP 指数基数 -0.003/点", max: 3, cost: 2, type: "additive", tier: 1, effect: { kind: "hpGrowthReduction", perPoint: 0.003 } },
  { id: "sing_cap", tree: "singularity", name: "攻速破限", desc: "攻速软上限 +1/点", max: 3, cost: 2, type: "additive", tier: 1, effect: { kind: "apsCap", perPoint: 1 } },
  { id: "sing_skill_cd", tree: "singularity", name: "时空折叠", desc: "技能冷却 -4%/点", max: 3, cost: 2, type: "additive", tier: 2, requires: ["sing_law"], effect: { kind: "skillCdPct", perPoint: 0.04 } },
  { id: "sing_overflow", tree: "singularity", name: "溢流共振", desc: "溢出效率 +30%/点", max: 3, cost: 2, type: "mult", tier: 2, requires: ["sing_cap"], effect: { kind: "overflowEff", perPoint: 0.3 } },
  { id: "sing_keystone_boss", tree: "singularity", name: "深渊豪赌", desc: "Boss 生命 ×2，Boss 金币 ×6（猎杀流）", max: 1, cost: 4, type: "keystone", tier: 3, requires: ["sing_skill_cd", "sing_overflow"], exclusiveGroup: "singularity_keystone", effect: { kind: "keystone", key: "bossGamble" } },
  { id: "sing_keystone_gold", tree: "singularity", name: "财富引力", desc: "当前金币每高 10 倍 → 全伤害 ×1.15", max: 1, cost: 4, type: "keystone", tier: 3, requires: ["sing_skill_cd", "sing_overflow"], exclusiveGroup: "singularity_keystone", effect: { kind: "keystone", key: "goldGravity" } },
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