import type { BossAffix, WorldId } from "../types";

export interface WorldDef {
  id: WorldId;
  name: string;
  stageRange: [number, number];
  color: string;
  enemyStyle: string;
  bossPool: BossAffix[];
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
];

export function worldForStage(stage: number): WorldDef {
  let w = WORLDS[0];
  for (const world of WORLDS) {
    if (stage >= world.stageRange[0]) w = world;
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
};

export const BOSS_AFFIX_DESC: Record<BossAffix, string> = {
  armor: "普通伤害 -50%",
  regen: "每秒回复 3% 最大生命",
  antiCrit: "暴击倍率 -50%",
  rage: "每秒防御 +2%（上限 60%）",
  harden: "每 6 秒获得 1 层硬化，每层减伤 8%（上限 40%）",
  deflect: "非暴击伤害 -70%（暴击不受影响）",
};

export const BOSS_AFFIX_ICON: Record<BossAffix, string> = {
  armor: "🛡️",
  regen: "💚",
  antiCrit: "🌀",
  rage: "🔥",
  harden: "🧱",
  deflect: "🪞",
};
