import type { GameState } from "../types";
import { toBig } from "../bignum";

export type AchievementCheck =
  | { type: "damageMag"; mag: number }
  | { type: "goldMag"; mag: number }
  | { type: "kills"; n: number }
  | { type: "bossKills"; n: number }
  | { type: "crits"; n: number }
  | { type: "superCrits"; n: number }
  | { type: "clicks"; n: number }
  | { type: "prestiges"; n: number }
  | { type: "maxStage"; n: number }
  | { type: "enhance"; n: number }
  | { type: "combo"; n: number }
  | { type: "firstBoss" }
  | { type: "firstPrestige" };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean;
  check: AchievementCheck;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_crit", name: "初次暴击", desc: "触发第一次暴击", check: { type: "crits", n: 1 } },
  { id: "crit_100", name: "暴击百连", desc: "累计触发 100 次暴击", check: { type: "crits", n: 100 } },
  { id: "super_crit_1", name: "超越临界", desc: "触发第一次超暴击", check: { type: "superCrits", n: 1 } },
  { id: "super_crit_100", name: "临界风暴", desc: "累计触发 100 次超暴击", check: { type: "superCrits", n: 100 } },
  { id: "kill_10", name: "数据清除者", desc: "击败 10 个异常数据体", check: { type: "kills", n: 10 } },
  { id: "kill_100", name: "荒原猎手", desc: "击败 100 个异常数据体", check: { type: "kills", n: 100 } },
  { id: "kill_1000", name: "批量清理", desc: "击败 1000 个异常数据体", check: { type: "kills", n: 1000 } },
  { id: "kill_10000", name: "数据洪流", desc: "击败 10000 个异常数据体", check: { type: "kills", n: 10000 } },
  { id: "boss_1", name: "首杀 Boss", desc: "击败第一个 Boss", check: { type: "bossKills", n: 1 } },
  { id: "boss_10", name: "观测者试炼", desc: "击败 10 个 Boss", check: { type: "bossKills", n: 10 } },
  { id: "boss_50", name: "世界线稳定器", desc: "击败 50 个 Boss", check: { type: "bossKills", n: 50 } },
  { id: "click_100", name: "点击初体验", desc: "点击 100 次", check: { type: "clicks", n: 100 } },
  { id: "click_1000", name: "指尖观测者", desc: "点击 1000 次", check: { type: "clicks", n: 1000 } },
  { id: "combo_50", name: "连续观测", desc: "连击达到 50", check: { type: "combo", n: 50 } },
  { id: "combo_100", name: "极限连击", desc: "连击达到 100", check: { type: "combo", n: 100 } },
  { id: "stage_50", name: "深入荒原", desc: "到达第 50 关", check: { type: "maxStage", n: 50 } },
  { id: "stage_100", name: "荒原边界", desc: "到达第 100 关", check: { type: "maxStage", n: 100 } },
  { id: "stage_300", name: "数据风暴", desc: "到达第 300 关", check: { type: "maxStage", n: 300 } },
  { id: "stage_500", name: "机械城市", desc: "到达第 500 关", check: { type: "maxStage", n: 500 } },
  { id: "damage_1m", name: "百万伤害", desc: "累计伤害达到 1M", check: { type: "damageMag", mag: 6 } },
  { id: "damage_1b", name: "十亿伤害", desc: "累计伤害达到 1B", check: { type: "damageMag", mag: 9 } },
  { id: "damage_1e15", name: "星系级伤害", desc: "累计伤害达到 1e15", check: { type: "damageMag", mag: 15 } },
  { id: "damage_1e30", name: "宇宙级伤害", desc: "累计伤害达到 1e30", check: { type: "damageMag", mag: 30 } },
  { id: "gold_1m", name: "百万富翁", desc: "累计金币达到 1M", check: { type: "goldMag", mag: 6 } },
  { id: "gold_1e12", name: "万亿尘埃", desc: "累计金币达到 1T", check: { type: "goldMag", mag: 12 } },
  { id: "enhance_5", name: "强化入门", desc: "任意装备强化到 +5", check: { type: "enhance", n: 5 } },
  { id: "enhance_10", name: "满级强化", desc: "任意装备强化到 +10", check: { type: "enhance", n: 10 } },
  { id: "prestige_1", name: "首次坍缩", desc: "完成第一次重构", check: { type: "prestiges", n: 1 } },
  { id: "prestige_5", name: "宇宙更迭", desc: "完成 5 次重构", check: { type: "prestiges", n: 5 } },
  { id: "prestige_10", name: "坍缩大师", desc: "完成 10 次重构", check: { type: "prestiges", n: 10 }, hidden: true },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function checkAchievement(def: AchievementDef, state: GameState): boolean {
  const c = def.check;
  switch (c.type) {
    case "damageMag": return toBig(state.statistics.totalDamage).log10() >= c.mag;
    case "goldMag": return toBig(state.statistics.totalGold).log10() >= c.mag;
    case "kills": return state.statistics.totalKills >= c.n;
    case "bossKills": return state.statistics.totalBossKills >= c.n;
    case "crits": return state.statistics.totalCrits >= c.n;
    case "superCrits": return state.statistics.totalSuperCrits >= c.n;
    case "clicks": return state.statistics.totalClicks >= c.n;
    case "prestiges": return state.statistics.totalPrestiges >= c.n;
    case "maxStage": return state.statistics.allTimeMaxStage >= c.n;
    case "enhance": return Object.values(state.equipment.slots).some((e) => e && e.level >= c.n);
    case "combo": return state.combat.combo >= c.n;
    case "firstBoss": return state.statistics.totalBossKills >= 1;
    case "firstPrestige": return state.statistics.totalPrestiges >= 1;
  }
}