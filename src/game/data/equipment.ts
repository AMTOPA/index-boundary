import type { AffixStat, EquipSlot, Rarity } from "../types";
import { CONFIG } from "../config";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "普通",
  fine: "优秀",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9aa5b1",
  fine: "#3ddc84",
  rare: "#4da3ff",
  epic: "#b26bff",
  legendary: "#ffb52e",
};

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "武器",
  core: "核心",
  engine: "引擎",
  charm: "护符",
};

export const SLOT_ICON: Record<EquipSlot, string> = {
  weapon: "⚔️",
  core: "💠",
  engine: "⚙️",
  charm: "🔮",
};

// 套装信息（定义在 config，这里提供 UI 展示辅助）
export function activeSets(slots: Partial<Record<EquipSlot, { slot: EquipSlot }>>): { id: string; name: string; desc: string; active: boolean }[] {
  return CONFIG.EQUIPMENT.SETS.map((set) => {
    const complete = set.slots.every((s) => slots[s as EquipSlot]);
    return { id: set.id, name: set.name, desc: set.desc, active: complete };
  });
}

export const AFFIX_LABEL: Record<AffixStat, string> = {
  atkPct: "攻击加成",
  aspdPct: "攻速加成",
  critRate: "暴击率",
  critDmg: "暴击伤害",
  goldPct: "金币加成",
  bossDmg: "Boss 伤害",
  skillDmg: "技能伤害",
  overflowEff: "溢出效率",
  clickDmg: "点击伤害",
  comboCap: "连击上限",
  comboWindow: "连击窗口",
  everyNAttack: "每N次攻击",
};

export const AFFIX_HINT: Record<AffixStat, string> = {
  atkPct: "加法池：攻击力 +%",
  aspdPct: "独立：攻速 ×",
  critRate: "暴击率 +%（可超 100%）",
  critDmg: "暴击伤害 +%",
  goldPct: "加法池：金币 +%",
  bossDmg: "独立乘区：对 Boss 伤害 ×",
  skillDmg: "独立乘区：技能伤害 ×",
  overflowEff: "独立乘区：溢出金币 ×",
  clickDmg: "独立乘区：点击伤害 ×",
  comboCap: "连击上限 +",
  comboWindow: "连击窗口 +秒",
  everyNAttack: "每 N 次攻击触发伤害 ×",
};

export const MAIN_STAT_LABEL: Record<AffixStat, string> = {
  atkPct: "攻击",
  aspdPct: "攻速",
  critRate: "暴击率",
  critDmg: "暴击伤害",
  goldPct: "金币",
  bossDmg: "Boss 伤害",
  skillDmg: "技能伤害",
  overflowEff: "溢出效率",
  clickDmg: "点击伤害",
  comboCap: "连击上限",
  comboWindow: "连击窗口",
  everyNAttack: "每N次攻击",
};

export function rarityOrder(r: Rarity): number {
  return { common: 0, fine: 1, rare: 2, epic: 3, legendary: 4 }[r];
}

export function betterRarity(a: Rarity, b: Rarity): Rarity {
  return rarityOrder(a) >= rarityOrder(b) ? a : b;
}

// 词条值格式化：% 型显示百分比，倍率型显示 ×
export function formatAffixValue(stat: AffixStat, value: number): string {
  if (stat === "comboCap" || stat === "comboWindow") {
    return `+${value}`;
  }
  return `+${Math.round(value * 100)}%`;
}