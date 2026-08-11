import type { ItemId, ToolId } from "../types";

export interface ItemDef {
  id: ItemId;
  name: string;
  desc: string;
  icon: string;
  kind: "consumable";
}

export interface ToolDef {
  id: ToolId;
  name: string;
  desc: string;
  icon: string;
  kind: "tool";
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  overclock_chip: { id: "overclock_chip", name: "超频芯片", desc: "5 分钟内攻击速度 ×2", icon: "⚡", kind: "consumable" },
  gold_protocol: { id: "gold_protocol", name: "黄金协议", desc: "5 分钟内金币 ×5", icon: "💰", kind: "consumable" },
  singularity_battery: { id: "singularity_battery", name: "奇点电池", desc: "立即恢复全部技能冷却", icon: "🔋", kind: "consumable" },
};

export const TOOL_DEFS: Record<ToolId, ToolDef> = {
  auto_upgrade: { id: "auto_upgrade", name: "自动升级模块", desc: "分三级提升自动升级速度：0.5 秒、0.1 秒与每逻辑帧并行批量升级", icon: "🤖", kind: "tool" },
  auto_boss: { id: "auto_boss", name: "Boss 自动挑战器", desc: "Boss 超时后自动重新挑战；Boss 攻击与普通关卡自动攻击一致", icon: "🎯", kind: "tool" },
  auto_breakdown: { id: "auto_breakdown", name: "自动分解器", desc: "获得购买权限后，可按设定稀有度自动分解装备", icon: "♻️", kind: "tool" },
  combat_recorder: { id: "combat_recorder", name: "战斗记录仪", desc: "永久显示详细战斗统计", icon: "📊", kind: "tool" },
  auto_skill: { id: "auto_skill", name: "自动释放模块", desc: "主动技能冷却完成后自动释放", icon: "⚙️", kind: "tool" },
  auto_equip: { id: "auto_equip", name: "自动换装模块", desc: "获得更优装备时自动比较并换装", icon: "🔄", kind: "tool" },
  auto_prestige: { id: "auto_prestige", name: "自动重构模块", desc: "分基础与策略两级；高级可配置关卡、能量或倍率比阈值", icon: "🌀", kind: "tool" },
};
