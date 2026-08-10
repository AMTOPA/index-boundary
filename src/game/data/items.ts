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
  auto_upgrade: { id: "auto_upgrade", name: "自动升级模块", desc: "自动购买收益最高的升级", icon: "🤖", kind: "tool" },
  auto_boss: { id: "auto_boss", name: "Boss 自动挑战器", desc: "Boss 战失败后自动重试", icon: "🎯", kind: "tool" },
  auto_breakdown: { id: "auto_breakdown", name: "自动分解器", desc: "按稀有度自动分解装备", icon: "♻️", kind: "tool" },
  combat_recorder: { id: "combat_recorder", name: "战斗记录仪", desc: "解锁完整统计面板", icon: "📊", kind: "tool" },
  auto_skill: { id: "auto_skill", name: "自动释放模块", desc: "技能冷却结束自动释放", icon: "⚙️", kind: "tool" },
};