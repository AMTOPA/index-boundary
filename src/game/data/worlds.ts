import type { BossAffix, VoidTarget, WorldId } from "../types";

export interface WorldDef {
  id: WorldId;
  name: string;
  stageRange: [number, number];
  color: string;
  enemyStyle: string;
  bossPool: BossAffix[];
  requiresLeap?: number; // 需要的「新世界」升级等级（0/缺省=基础世界）
}

export const WORLDS: WorldDef[] = [
  {
    id: "data_wastes",
    name: "数据荒原",
    stageRange: [1, 100],
    color: "#7fd1c0",
    enemyStyle: "灰绿几何体",
    bossPool: ["armor", "regen", "antiCrit", "rage"],
  },
  {
    id: "mech_city",
    name: "机械城市",
    stageRange: [101, 500],
    color: "#c9a66b",
    enemyStyle: "金属方块",
    bossPool: ["armor", "regen", "antiCrit", "rage"],
  },
  {
    id: "star_factory",
    name: "恒星工厂",
    stageRange: [501, 2000],
    color: "#ff8c42",
    enemyStyle: "橙红多边形",
    bossPool: ["armor", "regen", "antiCrit", "rage", "harden", "deflect"],
  },
  {
    id: "black_hole",
    name: "黑洞边界",
    stageRange: [2001, 10000],
    color: "#b26bff",
    enemyStyle: "深紫引力扭曲体",
    bossPool: ["armor", "regen", "antiCrit", "rage", "harden", "deflect"],
  },
  {
    id: "singularity_furnace",
    name: "奇点熔炉",
    stageRange: [10001, 50000],
    color: "#ff5e8a",
    enemyStyle: "熔金棱晶",
    bossPool: ["armor", "regen", "antiCrit", "rage", "harden", "deflect", "time", "shield", "void"],
    requiresLeap: 1,
  },
  {
    id: "law_terminus",
    name: "法则终境",
    stageRange: [50001, 100000],
    color: "#7ee8ff",
    enemyStyle: "纯白法则体",
    bossPool: ["armor", "regen", "antiCrit", "rage", "harden", "deflect", "time", "shield", "void"],
    requiresLeap: 2,
  },
];

export function worldForStage(stage: number, newWorldLevel = 0): WorldDef {
  let w = WORLDS[0];
  for (const world of WORLDS) {
    const need = world.requiresLeap ?? 0;
    if (stage >= world.stageRange[0] && newWorldLevel >= need) w = world;
  }
  return w;
}

export const BOSS_AFFIX_LABEL: Record<BossAffix, string> = {
  armor: "厚甲",
  regen: "再生",
  antiCrit: "反暴击",
  rage: "狂暴",
  harden: "硬化",
  deflect: "偏斜",
  time: "时空",
  shield: "能量盾",
  void: "虚无",
};

export const BOSS_AFFIX_DESC: Record<BossAffix, string> = {
  armor: "普通伤害 -50%",
  regen: "每秒回复 3% 最大生命",
  antiCrit: "暴击倍率 -50%",
  rage: "每秒防御 +2%（上限 60%）",
  harden: "每 6 秒获得 1 层硬化，每层减伤 8%（上限 40%）",
  deflect: "非暴击伤害 -70%（暴击不受影响）",
  time: "Boss 计时流速 +50%（更紧迫）",
  shield: "前 20 次伤害固定为 1（高单发伤害可破盾）",
  void: "免疫 1 个随机乘区（暴击/点击/技能/金币）",
};

export const BOSS_AFFIX_ICON: Record<BossAffix, string> = {
  armor: "🛡️",
  regen: "💚",
  antiCrit: "🌀",
  rage: "🔥",
  harden: "🧱",
  deflect: "🪞",
  time: "\u23f3",
  shield: "\ud83d\udee1\ufe0f",
  void: "\ud83c\udf11",
};

// 精英词缀池（比 Boss 轻量，不含 Boss 专属时空/能量盾/虚无）
export const VOID_TARGET_LABEL: Record<VoidTarget, string> = {
  crit: "暴击",
  click: "点击",
  skill: "技能",
  gold: "金币",
};

export const ELITE_AFFIX_POOL: BossAffix[] = ["armor", "rage", "harden", "deflect"];

